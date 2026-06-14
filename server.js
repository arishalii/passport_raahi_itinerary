const express = require('express');
const path = require('path');
const db = require('./db');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Custom cookie parsing middleware
app.use((req, res, next) => {
  req.cookies = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      req.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  next();
});

// Middleware to check authentication
async function requireAuth(req, res, next) {
  const sessionToken = req.cookies['session_token'];
  if (!sessionToken) {
    return res.redirect('/login');
  }
  
  // Verify user exists using database adapter
  try {
    const user = await db.getUser(sessionToken);
    if (!user) {
      return res.redirect('/login');
    }
    req.user = user;
    next();
  } catch (err) {
    return res.redirect('/login');
  }
}

// Middleware to check editor role
function requireEditor(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'editor') {
      return res.status(403).send(`
        <html>
        <head>
          <title>Access Forbidden | Passport Raahi</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-900 text-white font-sans h-screen flex items-center justify-center">
          <div class="text-center p-8 border border-slate-800 rounded-2xl max-w-sm bg-slate-950/50">
            <h1 class="text-2xl font-bold text-red-500 mb-2">Access Forbidden</h1>
            <p class="text-slate-400 text-sm mb-6">Your customer account does not have permission to edit or design itineraries.</p>
            <a href="/trip" class="bg-amber-500 text-slate-950 px-6 py-2.5 rounded-xl font-semibold hover:bg-amber-600 transition-colors">Go to My Trip View</a>
          </div>
        </body>
        </html>
      `);
    }
    next();
  });
}

// Auth endpoints
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.authenticate(username, password);
    if (user) {
      res.setHeader('Set-Cookie', `session_token=${username}; Path=/; HttpOnly; Max-Age=86400`);
      res.json({ role: user.role, name: user.name });
    } else {
      res.status(401).send('Invalid username or password.');
    }
  } catch (err) {
    res.status(500).send('Authentication error.');
  }
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/login');
});

// JSON API endpoints
app.get('/api/profile', requireAuth, (req, res) => {
  res.json({
    username: req.user.username,
    name: req.user.name,
    role: req.user.role
  });
});

app.get('/api/itinerary', requireAuth, async (req, res) => {
  try {
    res.json(await db.getItinerary());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

app.post('/api/itinerary', requireEditor, async (req, res) => {
  try {
    await db.saveItinerary(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write database' });
  }
});

// Gemini AI Itinerary Builder API endpoints
const gemini = require('./gemini');

app.post('/api/builder/analyze', requireEditor, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    const analysis = await gemini.analyzeText(text);
    res.json(analysis);
  } catch (err) {
    console.error("Gemini analysis error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/builder/generate', requireEditor, async (req, res) => {
  try {
    const criteria = req.body;
    if (!criteria.destination || !criteria.days) {
      return res.status(400).json({ error: 'Destination and Days are required' });
    }
    const itinerary = await gemini.generateItinerary(criteria);
    // Persist immediately to the active Supabase / local database
    await db.saveItinerary(itinerary);
    res.json({ success: true, itinerary });
  } catch (err) {
    console.error("Gemini generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Page Routes (Protected)
app.get('/', requireAuth, (req, res) => {
  if (req.user.role === 'editor') {
    res.sendFile(path.join(__dirname, 'my_trips_dashboard.html'));
  } else {
    res.sendFile(path.join(__dirname, 'customer_dashboard.html'));
  }
});

app.get('/dashboard', requireAuth, (req, res) => {
  if (req.user.role === 'editor') {
    res.sendFile(path.join(__dirname, 'my_trips_dashboard.html'));
  } else {
    res.sendFile(path.join(__dirname, 'customer_dashboard.html'));
  }
});

app.get('/builder', requireEditor, (req, res) => {
  res.sendFile(path.join(__dirname, 'ai_itinerary_builder.html'));
});

app.get('/editor', requireEditor, (req, res) => {
  res.sendFile(path.join(__dirname, 'itinerary_editor.html'));
});

app.get('/trip', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'interactive_trip_view.html'));
});

app.get('/review', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'interactive_trip_view.html'));
});

// Fallback error handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`Passport Raahi server is running successfully!`);
  console.log(`Access your website at: http://localhost:${PORT}`);
  console.log(`===================================================`);
});

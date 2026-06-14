const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const DB_FILE = path.join(__dirname, 'db.json');

// 1. Initialize Supabase API Client if URL and Key are provided
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("Supabase Client API initialized successfully.");
}

// 2. Fallback to direct Postgres connection pool if DATABASE_URL is set
let pool = null;
if (!supabase && process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  console.log("Supabase PostgreSQL direct pool connection initialized successfully.");
}

if (!supabase && !pool) {
  console.log("Using local JSON file database fallback.");
}

// Memory cache fallback for read-only systems
let memoryDb = null;

function readLocalDb() {
  if (memoryDb) return memoryDb;
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read db.json, returning empty structure", err);
    return { users: {}, itinerary: [] };
  }
}

function writeLocalDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn("Writing to disk failed (typical on serverless Vercel). Falling back to in-memory state.");
    memoryDb = data;
  }
}

module.exports = {
  getItinerary: async () => {
    // A. Use Supabase API Client
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('itineraries')
          .select('data')
          .order('id', { ascending: false })
          .limit(1);
        if (error) throw error;
        if (data && data.length > 0) return data[0].data;
        return [];
      } catch (err) {
        console.error("Supabase API read error, falling back:", err);
      }
    }
    // B. Use direct Postgres pool
    if (pool) {
      try {
        const res = await pool.query('SELECT data FROM itineraries ORDER BY id DESC LIMIT 1');
        if (res.rows.length > 0) {
          return res.rows[0].data;
        }
        return [];
      } catch (err) {
        console.error("Supabase direct SQL read error, falling back:", err);
      }
    }
    // C. Local file fallback
    return readLocalDb().itinerary;
  },

  saveItinerary: async (itinerary) => {
    // A. Use Supabase API Client
    if (supabase) {
      try {
        const { data: check, error: checkErr } = await supabase
          .from('itineraries')
          .select('id')
          .limit(1);
        if (checkErr) throw checkErr;

        if (check && check.length > 0) {
          const { error } = await supabase
            .from('itineraries')
            .update({ data: itinerary, updated_at: new Date() })
            .eq('id', check[0].id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('itineraries')
            .insert({ title: 'Kuala Lumpur Family Escape', data: itinerary });
          if (error) throw error;
        }
        return;
      } catch (err) {
        console.error("Supabase API write error, falling back:", err);
      }
    }
    // B. Use direct Postgres pool
    if (pool) {
      try {
        const check = await pool.query('SELECT id FROM itineraries LIMIT 1');
        if (check.rows.length > 0) {
          await pool.query('UPDATE itineraries SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(itinerary), check.rows[0].id]);
        } else {
          await pool.query('INSERT INTO itineraries (title, data) VALUES ($1, $2)', ['Kuala Lumpur Family Escape', JSON.stringify(itinerary)]);
        }
        return;
      } catch (err) {
        console.error("Supabase direct SQL write error, falling back:", err);
      }
    }
    // C. Local file fallback
    const db = readLocalDb();
    db.itinerary = itinerary;
    writeLocalDb(db);
  },

  authenticate: async (username, password) => {
    // A. Use Supabase API Client
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('username, role, name')
          .eq('username', username)
          .eq('password', password)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (err) {
        console.error("Supabase API auth error, falling back:", err);
      }
    }
    // B. Use direct Postgres pool
    if (pool) {
      try {
        const res = await pool.query('SELECT username, role, name FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (res.rows.length > 0) {
          return {
            username: res.rows[0].username,
            role: res.rows[0].role,
            name: res.rows[0].name
          };
        }
        return null;
      } catch (err) {
        console.error("Supabase direct SQL auth error, falling back:", err);
      }
    }
    // C. Local file fallback
    const db = readLocalDb();
    const user = db.users[username];
    if (user && user.password === password) {
      return user;
    }
    return null;
  },

  getUser: async (username) => {
    // A. Use Supabase API Client
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('username, role, name')
          .eq('username', username)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (err) {
        console.error("Supabase API getUser error, falling back:", err);
      }
    }
    // B. Use direct Postgres pool
    if (pool) {
      try {
        const res = await pool.query('SELECT username, role, name FROM users WHERE username = $1', [username]);
        if (res.rows.length > 0) {
          return res.rows[0];
        }
        return null;
      } catch (err) {
        console.error("Supabase direct SQL getUser error, falling back:", err);
      }
    }
    // C. Local file fallback
    return readLocalDb().users[username];
  },

  getComments: async (day, blockTitle) => {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('comments')
          .select('username, name, comment, created_at')
          .eq('day', day)
          .eq('block_title', blockTitle)
          .order('id', { ascending: true });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error("Supabase API getComments error:", err);
      }
    }
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT username, name, comment, created_at FROM comments WHERE day = $1 AND block_title = $2 ORDER BY id ASC',
          [day, blockTitle]
        );
        return res.rows;
      } catch (err) {
        console.error("Supabase direct SQL getComments error:", err);
      }
    }
    // Fallback local file
    const db = readLocalDb();
    const comments = db.comments || [];
    return comments.filter(c => c.day === parseInt(day) && c.blockTitle === blockTitle);
  },

  saveComment: async (day, blockTitle, username, name, comment) => {
    if (supabase) {
      try {
        const { error } = await supabase
          .from('comments')
          .insert({
            day: parseInt(day),
            block_title: blockTitle,
            username,
            name,
            comment
          });
        if (error) throw error;
        return;
      } catch (err) {
        console.error("Supabase API saveComment error:", err);
      }
    }
    if (pool) {
      try {
        await pool.query(
          'INSERT INTO comments (day, block_title, username, name, comment) VALUES ($1, $2, $3, $4, $5)',
          [parseInt(day), blockTitle, username, name, comment]
        );
        return;
      } catch (err) {
        console.error("Supabase direct SQL saveComment error:", err);
      }
    }
    // Fallback local file
    const db = readLocalDb();
    if (!db.comments) db.comments = [];
    db.comments.push({
      day: parseInt(day),
      blockTitle,
      username,
      name,
      comment,
      created_at: new Date().toISOString()
    });
    writeLocalDb(db);
  },

  getTeam: async () => {
    const defaultTeam = [
      { id: "arish", name: "Syed Arish Ali", role: "CTO [Chief Technical Officer]", photo: "" },
      { id: "tayyaba", name: "Tayyaba Nagrmi", role: "Managing Sales Director", photo: "" },
      { id: "tanu", name: "Tanu Arora", role: "AVP Trip Advisor [Ex MakeMyTrip]", photo: "" }
    ];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('team')
          .select('id, name, role, photo');
        if (error) throw error;
        if (data && data.length > 0) return data;
      } catch (err) {
        console.error("Supabase getTeam error, returning default:", err);
      }
    }
    if (pool) {
      try {
        const res = await pool.query('SELECT id, name, role, photo FROM team');
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.error("Postgres getTeam error, returning default:", err);
      }
    }
    // Local fallback
    const db = readLocalDb();
    if (db.team && db.team.length > 0) return db.team;
    return defaultTeam;
  },

  saveTeamPhoto: async (id, photo) => {
    if (supabase) {
      try {
        const { data, error: checkErr } = await supabase
          .from('team')
          .select('id')
          .eq('id', id);
        if (checkErr) throw checkErr;
        
        if (data && data.length > 0) {
          const { error } = await supabase
            .from('team')
            .update({ photo })
            .eq('id', id);
          if (error) throw error;
        } else {
          const defaults = {
            arish: { name: "Syed Arish Ali", role: "CTO [Chief Technical Officer]" },
            tayyaba: { name: "Tayyaba Nagrmi", role: "Managing Sales Director" },
            tanu: { name: "Tanu Arora", role: "AVP Trip Advisor [Ex MakeMyTrip]" }
          };
          const info = defaults[id] || { name: "Team Member", role: "Specialist" };
          const { error } = await supabase
            .from('team')
            .insert({ id, name: info.name, role: info.role, photo });
          if (error) throw error;
        }
        return;
      } catch (err) {
        console.error("Supabase saveTeamPhoto error:", err);
      }
    }
    if (pool) {
      try {
        const res = await pool.query('SELECT id FROM team WHERE id = $1', [id]);
        if (res.rows.length > 0) {
          await pool.query('UPDATE team SET photo = $2 WHERE id = $1', [id, photo]);
        } else {
          const defaults = {
            arish: { name: "Syed Arish Ali", role: "CTO [Chief Technical Officer]" },
            tayyaba: { name: "Tayyaba Nagrmi", role: "Managing Sales Director" },
            tanu: { name: "Tanu Arora", role: "AVP Trip Advisor [Ex MakeMyTrip]" }
          };
          const info = defaults[id] || { name: "Team Member", role: "Specialist" };
          await pool.query('INSERT INTO team (id, name, role, photo) VALUES ($1, $2, $3, $4)', [id, info.name, info.role, photo]);
        }
        return;
      } catch (err) {
        console.error("Postgres saveTeamPhoto error:", err);
      }
    }
    // Local fallback
    const db = readLocalDb();
    if (!db.team) {
      db.team = [
        { id: "arish", name: "Syed Arish Ali", role: "CTO [Chief Technical Officer]", photo: "" },
        { id: "tayyaba", name: "Tayyaba Nagrmi", role: "Managing Sales Director", photo: "" },
        { id: "tanu", name: "Tanu Arora", role: "AVP Trip Advisor [Ex MakeMyTrip]", photo: "" }
      ];
    }
    const member = db.team.find(m => m.id === id);
    if (member) {
      member.photo = photo;
    } else {
      db.team.push({ id, name: "Team Member", role: "Specialist", photo });
    }
    writeLocalDb(db);
  }
};


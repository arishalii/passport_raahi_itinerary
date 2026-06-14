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
  }
};

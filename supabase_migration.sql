-- Create comments table in Supabase
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  day INT NOT NULL,
  block_title TEXT NOT NULL,
  username TEXT NOT NULL,
  name TEXT,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to view comments
CREATE POLICY "Allow authenticated users to read comments"
ON comments FOR SELECT
TO authenticated
USING (true);

-- Policy to allow authenticated users to insert comments
CREATE POLICY "Allow authenticated users to insert comments"
ON comments FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create team table in Supabase
CREATE TABLE IF NOT EXISTS team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  photo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE team ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to view team
CREATE POLICY "Allow authenticated users to read team"
ON team FOR SELECT
TO authenticated
USING (true);

-- Policy to allow authenticated users to update/insert team
CREATE POLICY "Allow authenticated users to update team"
ON team FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);


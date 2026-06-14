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

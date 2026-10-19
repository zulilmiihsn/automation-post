-- D1 schema untuk threads-publisher (free tier, 5GB).
-- Dijalankan via: wrangler d1 migrations apply threads-publisher

CREATE TABLE IF NOT EXISTS threads_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  threads_user_id TEXT NOT NULL,
  long_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS threads_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  image_url TEXT,
  topic_tag TEXT,
  reply_control TEXT DEFAULT 'everyone',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  threads_post_id TEXT,
  error TEXT,
  scheduled_for INTEGER,
  created_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_threads_queue_status ON threads_queue(status, scheduled_for);

CREATE TABLE IF NOT EXISTS threads_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

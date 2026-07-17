-- Supabase schema for R.E.D.T.I.E Superuser modules

-- Staff Oversight
CREATE TABLE IF NOT EXISTS staff_logs (
  id SERIAL PRIMARY KEY,
  staff_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_activity (
  staff_id TEXT PRIMARY KEY,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ticket_response_time_avg INTERVAL,
  flags_level INT DEFAULT 0
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets_log (
  ticket_id TEXT PRIMARY KEY,
  opener_id TEXT NOT NULL,
  reason TEXT,
  ai_handled BOOLEAN DEFAULT TRUE,
  staff_responder TEXT,
  open_time TIMESTAMP,
  first_response_time TIMESTAMP
);

-- Scheduler
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id SERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_time TIMESTAMP NOT NULL,
  repeat TEXT DEFAULT 'once', -- once, daily
  created_by TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

-- Core Brain Memory
CREATE TABLE IF NOT EXISTS server_memory (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  embedding VECTOR(1536), -- for vector search if using pgvector
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guild_id, key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_staff_logs_staff ON staff_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_tickets_opener ON tickets_log(opener_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_messages(scheduled_time) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_server_memory_guild ON server_memory(guild_id);
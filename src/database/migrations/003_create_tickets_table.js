export const up = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      ticket_id VARCHAR(10) UNIQUE NOT NULL,
      guild_id VARCHAR(20) NOT NULL,
      user_id VARCHAR(20) NOT NULL,
      channel_id VARCHAR(20) UNIQUE,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      assigned_to VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP,
      claimed_at TIMESTAMP,
      claimed_by VARCHAR(20),
      subject TEXT,
      description TEXT,
      priority VARCHAR(20) DEFAULT 'normal',
      is_archived BOOLEAN DEFAULT FALSE,
      reaction_message_id VARCHAR(20)
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id SERIAL PRIMARY KEY,
      ticket_id VARCHAR(10) NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
      author_id VARCHAR(20) NOT NULL,
      author_name VARCHAR(100),
      message_content TEXT NOT NULL,
      message_id VARCHAR(20) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

    CREATE TABLE IF NOT EXISTS ticket_settings (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(20) UNIQUE NOT NULL,
      category_channel_id VARCHAR(20),
      log_channel_id VARCHAR(20),
      support_role_id VARCHAR(20),
      ticket_prefix VARCHAR(10) DEFAULT 'TKT',
      max_open_per_user INT DEFAULT 5,
      auto_close_days INT DEFAULT 7,
      enable_priority BOOLEAN DEFAULT TRUE,
      enable_categories BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ticket_categories (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(20) NOT NULL,
      category_name VARCHAR(100) NOT NULL,
      description TEXT,
      emoji VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, category_name)
    );

    CREATE TABLE IF NOT EXISTS ticket_notes (
      id SERIAL PRIMARY KEY,
      ticket_id VARCHAR(10) NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
      author_id VARCHAR(20) NOT NULL,
      note_content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ticket_audit_log (
      id SERIAL PRIMARY KEY,
      ticket_id VARCHAR(10) NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      actor_id VARCHAR(20),
      details JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
    );
  `);
};

export const down = async (client) => {
  await client.query(`
    DROP TABLE IF NOT EXISTS ticket_audit_log;
    DROP TABLE IF NOT EXISTS ticket_notes;
    DROP TABLE IF NOT EXISTS ticket_categories;
    DROP TABLE IF NOT EXISTS ticket_settings;
    DROP TABLE IF NOT EXISTS ticket_messages;
    DROP TABLE IF NOT EXISTS tickets;
  `);
};

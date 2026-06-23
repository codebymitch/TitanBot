import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { logger } from './logger.js';

class SqliteDatabase {
  constructor(dbPath) {
    this.path = dbPath || process.env.SQLITE_PATH || './data/sqlite.db';
    this._ensureDir();
    this.db = null;
    this.ready = false;
  }

  _ensureDir() {
    const dir = path.dirname(this.path);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      // ignore
    }
  }

  connect() {
    try {
      this.db = new Database(this.path, { verbose: null });

      // key/value table with optional expiration (ms since epoch)
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY,
          value TEXT,
          expires_at INTEGER
        )`
      ).run();

      // simple index for prefix searches
      this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_kv_key ON kv(key)`).run();

      this.ready = true;
      logger.info(`SQLite database opened at ${this.path}`);
      return true;
    } catch (err) {
      logger.error('Failed to initialize SQLite database:', err);
      this.ready = false;
      return false;
    }
  }

  isAvailable() {
    return this.ready === true && this.db !== null;
  }

  disconnect() {
    try {
      if (this.db) this.db.close();
    } catch (err) {
      logger.warn('Error closing SQLite DB:', err.message);
    }
    this.db = null;
    this.ready = false;
  }

  _cleanupIfExpired(row) {
    if (!row) return false;
    if (row.expires_at && Date.now() > row.expires_at) return true;
    return false;
  }

  get(key, defaultValue = null) {
    try {
      if (!this.isAvailable()) return defaultValue;
      const row = this.db.prepare('SELECT value, expires_at FROM kv WHERE key = ?').get(key);
      if (!row) return defaultValue;
      if (this._cleanupIfExpired(row)) {
        this.delete(key);
        return defaultValue;
      }
      try {
        return JSON.parse(row.value);
      } catch (err) {
        return row.value;
      }
    } catch (err) {
      logger.error('SQLite get error for key', key, err.message);
      return defaultValue;
    }
  }

  set(key, value, ttl = null) {
    try {
      if (!this.isAvailable()) return false;
      const expiresAt = ttl && Number(ttl) > 0 ? Date.now() + Number(ttl) * 1000 : null;
      const text = JSON.stringify(value ?? null);
      this.db.prepare(
        `INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at`
      ).run(key, text, expiresAt);
      return true;
    } catch (err) {
      logger.error('SQLite set error for key', key, err.message);
      return false;
    }
  }

  delete(key) {
    try {
      if (!this.isAvailable()) return false;
      this.db.prepare('DELETE FROM kv WHERE key = ?').run(key);
      return true;
    } catch (err) {
      logger.error('SQLite delete error for key', key, err.message);
      return false;
    }
  }

  list(prefix) {
    try {
      if (!this.isAvailable()) return [];
      const like = `${prefix}%`;
      const rows = this.db.prepare('SELECT key, expires_at FROM kv WHERE key LIKE ?').all(like);
      const keys = [];
      for (const r of rows) {
        if (this._cleanupIfExpired(r)) {
          this.delete(r.key);
          continue;
        }
        keys.push(r.key);
      }
      return keys;
    } catch (err) {
      logger.error('SQLite list error for prefix', prefix, err.message);
      return [];
    }
  }

  exists(key) {
    try {
      if (!this.isAvailable()) return false;
      const row = this.db.prepare('SELECT 1, expires_at FROM kv WHERE key = ?').get(key);
      if (!row) return false;
      if (this._cleanupIfExpired(row)) {
        this.delete(key);
        return false;
      }
      return true;
    } catch (err) {
      logger.error('SQLite exists error for key', key, err.message);
      return false;
    }
  }

  increment(key, amount = 1) {
    try {
      if (!this.isAvailable()) return amount;
      const cur = this.get(key, 0);
      const newValue = (typeof cur === 'number' ? cur : Number(cur) || 0) + amount;
      this.set(key, newValue);
      return newValue;
    } catch (err) {
      logger.error('SQLite increment error for key', key, err.message);
      return amount;
    }
  }

  decrement(key, amount = 1) {
    try {
      if (!this.isAvailable()) return -amount;
      const cur = this.get(key, 0);
      const newValue = (typeof cur === 'number' ? cur : Number(cur) || 0) - amount;
      this.set(key, newValue);
      return newValue;
    } catch (err) {
      logger.error('SQLite decrement error for key', key, err.message);
      return -amount;
    }
  }
}

const sqliteDb = new SqliteDatabase();

export { SqliteDatabase, sqliteDb };

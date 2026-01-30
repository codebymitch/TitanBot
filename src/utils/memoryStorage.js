/**
 * In-memory storage fallback for when database is not available
 * This allows the bot to function in non-Replit environments
 */

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }

  async get(key, defaultValue = null) {
    return this.data.get(key) || defaultValue;
  }

  async set(key, value) {
    this.data.set(key, value);
    return true;
  }

  async delete(key) {
    return this.data.delete(key);
  }

  async list(prefix) {
    const keys = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  clear() {
    this.data.clear();
  }
}

export { MemoryStorage };

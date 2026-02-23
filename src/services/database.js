import 'dotenv/config';
import { pgDb } from '../utils/postgresDatabase.js';
import { logger } from '../utils/logger.js';
import { pgConfig } from '../config/postgres.js';

let db = null;
let useFallback = false;
let connectionType = 'none';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function initializeServicesDatabase() {
  try {
    logger.info('Services: Attempting to connect to PostgreSQL...');
    const pgConnected = await pgDb.connect();
    if (pgConnected) {
      db = pgDb;
      connectionType = 'postgresql';
      logger.info('✅ Services: PostgreSQL Database initialized');
      return;
    }
    if (IS_PRODUCTION) {
      logger.error('Services: PostgreSQL connection unavailable in production. Refusing to use fallback storage.');
      throw new Error('Critical database initialization failure in production environment');
    }
  } catch (error) {
    if (IS_PRODUCTION) {
      logger.error('Services: PostgreSQL connection failed in production:', error.message);
      throw error;
    }
    logger.warn('Services: PostgreSQL connection failed, using mock database:', error.message);
  }
  
  db = {
    get: async (key, defaultValue = null) => defaultValue,
    set: async (key, value, ttl = null) => true,
    delete: async (key) => true,
    list: async (prefix) => [],
    exists: async (key) => false,
    increment: async (key, amount = 1) => amount,
    decrement: async (key, amount = 1) => -amount
  };
  useFallback = true;
  connectionType = 'memory';
  logger.info('Services: Using mock database (fallback)');
}

initializeServicesDatabase().catch((error) => {
  logger.error('Fatal services database initialization failure:', error.message);
  if (IS_PRODUCTION) {
    process.exit(1);
  }
});


export function getGuildConfigKey(guildId) {
  return `guild:${guildId}:config`;
}

export function getGuildBirthdaysKey(guildId) {
  return `guild:${guildId}:birthdays`;
}

export function getEconomyKey(guildId, userId) {
  return `guild:${guildId}:economy:${userId}`;
}

export function getAFKKey(guildId, userId) {
  return `guild:${guildId}:afk:${userId}`;
}

export function giveawayKey(guildId) {
  return `guild:${guildId}:giveaways`;
}

export const getGiveawaysKey = giveawayKey;

export function getTicketKey(guildId, channelId) {
  return `guild:${guildId}:ticket:${channelId}`;
}

export function getWelcomeConfigKey(guildId) {
  return `guild:${guildId}:welcome`;
}

export function getLevelingKey(guildId) {
  return `guild:${guildId}:leveling`;
}

export function getUserLevelKey(guildId, userId) {
  return `guild:${guildId}:leveling:${userId}`;
}

export function getInviteTrackingKey(guildId) {
  return `guild:${guildId}:invites`;
}

export function getMemberInvitesKey(guildId, userId) {
  return `guild:${guildId}:invites:${userId}`;
}

export function getInviteUsesKey(guildId, inviteCode) {
  return `guild:${guildId}:invite_uses:${inviteCode}`;
}

export function getFakeAccountKey(guildId, userId) {
  return `guild:${guildId}:fake_account:${userId}`;
}


export async function initializeDatabase() {
  await initializeServicesDatabase();
  logger.info('Services database initialized');
  return db;
}

function extractData(replitResponse) {
  if (replitResponse && typeof replitResponse === 'object') {
    let current = replitResponse;
    while (current && typeof current === 'object' && 'ok' in current && 'value' in current) {
      current = current.value;
    }
    
    if (current && typeof current === 'object' && 'tasks' in current) {
      return current;
    }
    
    return current;
  }
  return replitResponse;
}

export async function getFromDb(key, defaultValue = null) {
  try {
    if (!db) {
      await initializeServicesDatabase();
    }
    const value = await db.get(key);
    
    const extractedData = extractData(value);
    
    const result = extractedData !== null ? extractedData : defaultValue;
    return result;
  } catch (error) {
    logger.error(`Error getting value for key ${key}:`, error);
    return defaultValue;
  }
}

export async function setInDb(key, value, ttl = null) {
  try {
    if (!db) {
      await initializeServicesDatabase();
    }
    await db.set(key, value, ttl);
    
    const verifyValue = await db.get(key);
    const extractedVerifyValue = extractData(verifyValue);
    
    return true;
  } catch (error) {
    logger.error(`Error setting value for key ${key}:`, error);
    return false;
  }
}

export async function deleteFromDb(key) {
  try {
    if (!db) {
      await initializeServicesDatabase();
    }
    await db.delete(key);
    return true;
  } catch (error) {
    logger.error(`Error deleting key ${key}:`, error);
    return false;
  }
}


export async function setGuildConfig(client, guildId, newData) {
  try {
    if (!db) {
      await initializeServicesDatabase();
    }
    const key = getGuildConfigKey(guildId);
    await db.set(key, newData);
    return true;
  } catch (error) {
    logger.error('Error setting guild config:', error);
    throw error;
  }
}


export async function getTicketData(guildId, channelId) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = getTicketKey(guildId, channelId);
  return await db.get(key);
}

export async function getOpenTicketCountForUser(guildId, userId) {
  try {
    if (!db) {
      await initializeServicesDatabase();
    }

    if (db?.pool && typeof db.isAvailable === 'function' && db.isAvailable()) {
      const result = await db.pool.query(
        `SELECT COUNT(*)::int AS count FROM ${pgConfig.tables.tickets}
         WHERE guild_id = $1
           AND data->>'userId' = $2
           AND COALESCE(data->>'status', 'open') = 'open'`,
        [guildId, userId]
      );

      return Number(result.rows?.[0]?.count || 0);
    }

    if (typeof db?.list === 'function') {
      const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
      let count = 0;

      for (const key of ticketKeys) {
        const ticket = await getFromDb(key, null);
        if (ticket && ticket.userId === userId && ticket.status === 'open') {
          count += 1;
        }
      }

      return count;
    }

    return 0;
  } catch (error) {
    logger.error(`Error counting open tickets for user ${userId} in guild ${guildId}:`, error);
    return 0;
  }
}

export async function saveTicketData(guildId, channelId, data) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = getTicketKey(guildId, channelId);
  await db.set(key, data);
}

export async function deleteTicketData(guildId, channelId) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = getTicketKey(guildId, channelId);
  await db.delete(key);
}


export async function getGuildGiveaways(client, guildId) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = giveawayKey(guildId);
  return await db.get(key) || [];
}

export async function saveGiveaway(client, guildId, giveawayData) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = giveawayKey(guildId);
  const giveaways = await getGuildGiveaways(client, guildId);
  const existingIndex = giveaways.findIndex(g => g.messageId === giveawayData.messageId);
  
  if (existingIndex >= 0) {
    giveaways[existingIndex] = giveawayData;
  } else {
    giveaways.push(giveawayData);
  }
  
  await db.set(key, giveaways);
  return giveawayData;
}

export async function deleteGiveaway(client, guildId, messageId) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = giveawayKey(guildId);
  const giveaways = await getGuildGiveaways(client, guildId);
  const updatedGiveaways = giveaways.filter(g => g.messageId !== messageId);
  
  if (updatedGiveaways.length !== giveaways.length) {
    await db.set(key, updatedGiveaways);
    return true;
  }
  
  return false;
}


export async function getWelcomeConfig(client, guildId) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = getWelcomeConfigKey(guildId);
  const config = await db.get(key);
  
  if (!config) {
    const defaultConfig = {
      enabled: false,
      channel: null,
      message: 'Welcome {user} to {server}!',
      dmMessage: null,
      role: null
    };
    
    await db.set(key, defaultConfig);
    return defaultConfig;
  }
  
  return config;
}

export async function saveWelcomeConfig(client, guildId, config) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = getWelcomeConfigKey(guildId);
  await db.set(key, config);
  return config;
}

export default {
  db,
  pgDb,
  initializeServicesDatabase,
  getConnectionType: () => connectionType,
  useFallback: () => useFallback
};




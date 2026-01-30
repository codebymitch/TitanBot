import { redisDb } from '../utils/redisDatabase.js';
import { logger } from '../utils/logger.js';

// Initialize database
let db = null;
let useFallback = false;

// Check if we're in a Replit environment (for backward compatibility)
const isReplitEnvironment = process.env.REPL_ID || process.env.REPL_OWNER || process.env.REPL_SLUG;

// Async database initialization
async function initializeServicesDatabase() {
  try {
    // Try to connect to Redis first
    const redisConnected = await redisDb.connect();
    if (redisConnected) {
      db = redisDb;
      logger.info('✅ Redis Database initialized in services');
      return;
    }
  } catch (error) {
    logger.warn('Redis connection failed in services, using fallback:', error.message);
  }
  
  // Fallback to mock database for non-Replit environments
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
  logger.info('Using mock database in services (fallback)');
}

// Initialize database immediately
initializeServicesDatabase();

// --- DATABASE KEY GENERATORS ---

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

// --- DATABASE OPERATIONS ---

// Initialize database connection
export async function initializeDatabase() {
  await initializeServicesDatabase();
  logger.info('Services database initialized');
  return db;
}

// Helper function to extract actual data from Replit database response
function extractData(replitResponse) {
  // Handle the nested response structure from @replit/database
  if (replitResponse && typeof replitResponse === 'object') {
    // Keep digging down until we find the actual data or hit a non-object
    let current = replitResponse;
    while (current && typeof current === 'object' && 'ok' in current && 'value' in current) {
      current = current.value;
    }
    
    // If we still have a response object with tasks array, extract that
    if (current && typeof current === 'object' && 'tasks' in current) {
      return current;
    }
    
    return current;
  }
  return replitResponse;
}

// Get a value from the database with a default value if not found
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

// Set a value in the database
export async function setInDb(key, value, ttl = null) {
  try {
    if (!db) {
      await initializeServicesDatabase();
    }
    await db.set(key, value, ttl);
    
    // Verify by reading it back
    const verifyValue = await db.get(key);
    const extractedVerifyValue = extractData(verifyValue);
    
    return true;
  } catch (error) {
    logger.error(`Error setting value for key ${key}:`, error);
    return false;
  }
}

// Delete a key from the database
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

// --- GUILD CONFIG FUNCTIONS ---

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

// --- TICKET FUNCTIONS ---

export async function getTicketData(guildId, channelId) {
  if (!db) {
    await initializeServicesDatabase();
  }
  const key = getTicketKey(guildId, channelId);
  return await db.get(key);
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

// --- GIVEAWAY FUNCTIONS ---

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

// --- WELCOME SYSTEM ---

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
  redisDb,
  initializeServicesDatabase,
  useFallback: () => useFallback
};

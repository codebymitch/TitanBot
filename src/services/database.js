import Database from '@replit/database';
import { logger } from '../utils/logger.js';

// Initialize database
const db = new Database();

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
  logger.info('Database initialized');
  return db;
}

// Get a value from the database with a default value if not found
export async function getFromDb(key, defaultValue = null) {
  try {
    const value = await db.get(key);
    return value !== null ? value : defaultValue;
  } catch (error) {
    logger.error(`Error getting value for key ${key}:`, error);
    return defaultValue;
  }
}

// Set a value in the database
export async function setInDb(key, value) {
  try {
    await db.set(key, value);
    return true;
  } catch (error) {
    logger.error(`Error setting value for key ${key}:`, error);
    return false;
  }
}

// Delete a key from the database
export async function deleteFromDb(key) {
  try {
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
  const key = getTicketKey(guildId, channelId);
  return await db.get(key);
}

export async function saveTicketData(guildId, channelId, data) {
  const key = getTicketKey(guildId, channelId);
  await db.set(key, data);
}

export async function deleteTicketData(guildId, channelId) {
  const key = getTicketKey(guildId, channelId);
  await db.delete(key);
}

// --- GIVEAWAY FUNCTIONS ---

export async function getGuildGiveaways(client, guildId) {
  const key = giveawayKey(guildId);
  return await db.get(key) || [];
}

export async function saveGiveaway(client, guildId, giveawayData) {
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
  const key = getWelcomeConfigKey(guildId);
  await db.set(key, config);
  return config;
}

export default db;

import { BotConfig } from "../config/bot.js";
import { getEconomyKey } from './database.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { normalizeEconomyData } from '../utils/schemas.js';

const BASE_BANK_CAPACITY = BotConfig.economy.baseBankCapacity;
const BANK_CAPACITY_PER_LEVEL = BotConfig.economy.bankCapacityPerLevel || 5000;

const DEFAULT_ECONOMY_DATA = {
    wallet: 0,
    bank: 0,
    bankLevel: 0,
    dailyStreak: 0,
    lastDaily: 0,
    lastWork: 0,
    lastCrime: 0,
    lastRob: 0,
    inventory: {},
    cooldowns: {}
};

/**
 * Helper function to calculate the user's maximum bank capacity
 * @param {Object} userData - The user's economy data
 * @returns {number} The maximum bank capacity for the user
 */
export function getMaxBankCapacity(userData) {
    if (!userData) return BASE_BANK_CAPACITY;
    
    const bankLevel = userData.bankLevel || 0;
    return BASE_BANK_CAPACITY + (bankLevel * BANK_CAPACITY_PER_LEVEL);
}

/**
 * Get economy data for a user
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} The user's economy data
 */
export async function getEconomyData(client, guildId, userId) {
    try {
        const key = getEconomyKey(guildId, userId);
        
        const data = await getFromDb(key, DEFAULT_ECONOMY_DATA);

        return normalizeEconomyData(data, DEFAULT_ECONOMY_DATA);
    } catch (error) {
        logger.error(`Error getting economy data for user ${userId} in guild ${guildId}:`, error);
        
        if (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('connection'))) {
            if (client._economyFallback) {
                const key = getEconomyKey(guildId, userId);
                const cached = client._economyFallback.get(key);
                return normalizeEconomyData(cached, DEFAULT_ECONOMY_DATA);
            }
        }
        
        return normalizeEconomyData({}, DEFAULT_ECONOMY_DATA);
    }
}

/**
 * Save economy data for a user
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {Object} newData - The new economy data to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function setEconomyData(client, guildId, userId, newData) {
    let mergedData = null;
    try {
        const key = getEconomyKey(guildId, userId);
        
        const existingData = await getEconomyData(client, guildId, userId);
        mergedData = normalizeEconomyData(
            { ...existingData, ...newData },
            DEFAULT_ECONOMY_DATA
        );
        
        await setInDb(key, mergedData);
        return true;
    } catch (error) {
        logger.error('Error saving economy data:', error);
        
        if (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('connection'))) {
            logger.warn(`PostgreSQL unavailable, using memory fallback for guild ${guildId}`);
            
            if (!client._economyFallback) {
                client._economyFallback = new Map();
            }
            client._economyFallback.set(key, mergedData);
            return true;
        }
        
        return false;
    }
}

/**
 * Add money to a user's wallet or bank
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {number} amount - The amount to add
 * @param {string} [type='wallet'] - Where to add the money ('wallet' or 'bank')
 * @returns {Promise<{success: boolean, newBalance: number, maxBank?: number}>} Result of the operation
 */
export async function addMoney(client, guildId, userId, amount, type = 'wallet') {
    try {
        if (amount <= 0) {
            return { success: false, error: 'Amount must be positive' };
        }

        const userData = await getEconomyData(client, guildId, userId);
        
        if (type === 'bank') {
            const maxBank = getMaxBankCapacity(userData);
            if ((userData.bank || 0) + amount > maxBank) {
                return { 
                    success: false, 
                    error: 'Bank capacity exceeded',
                    current: userData.bank || 0,
                    max: maxBank
                };
            }
            userData.bank = (userData.bank || 0) + amount;
        } else {
            userData.wallet = (userData.wallet || 0) + amount;
        }

        await setEconomyData(client, guildId, userId, userData);
        
        return { 
            success: true, 
            newBalance: type === 'bank' ? userData.bank : userData.wallet,
            ...(type === 'bank' ? { maxBank: getMaxBankCapacity(userData) } : {})
        };
    } catch (error) {
        logger.error(`Error adding money to ${type} for user ${userId} in guild ${guildId}:`, error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

/**
 * Remove money from a user's wallet or bank
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {number} amount - The amount to remove
 * @param {string} [type='wallet'] - Where to remove the money from ('wallet' or 'bank')
 * @returns {Promise<{success: boolean, newBalance: number}>} Result of the operation
 */
export async function removeMoney(client, guildId, userId, amount, type = 'wallet') {
    try {
        if (amount <= 0) {
            return { success: false, error: 'Amount must be positive' };
        }

        const userData = await getEconomyData(client, guildId, userId);
        
        if (type === 'bank') {
            if ((userData.bank || 0) < amount) {
                return { 
                    success: false, 
                    error: 'Insufficient funds in bank',
                    current: userData.bank || 0,
                    required: amount
                };
            }
            userData.bank = (userData.bank || 0) - amount;
        } else {
            if ((userData.wallet || 0) < amount) {
                return { 
                    success: false, 
                    error: 'Insufficient funds in wallet',
                    current: userData.wallet || 0,
                    required: amount
                };
            }
            userData.wallet = (userData.wallet || 0) - amount;
        }

        await setEconomyData(client, guildId, userId, userData);
        
        return { 
            success: true, 
            newBalance: type === 'bank' ? userData.bank : userData.wallet
        };
    } catch (error) {
        logger.error(`Error removing money from ${type} for user ${userId} in guild ${guildId}:`, error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

/**
 * Transfer money between wallet and bank
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {number} amount - The amount to transfer
 * @param {string} direction - 'deposit' or 'withdraw'
 * @returns {Promise<{success: boolean, wallet: number, bank: number, maxBank?: number}>} Result of the operation
 */
export async function transferMoney(client, guildId, userId, amount, direction) {
    try {
        if (amount <= 0) {
            return { success: false, error: 'Amount must be positive' };
        }

        const userData = await getEconomyData(client, guildId, userId);
        
        if (direction === 'deposit') {
            if (userData.wallet < amount) {
                return { 
                    success: false, 
                    error: 'Insufficient funds in wallet',
                    current: userData.wallet,
                    required: amount
                };
            }
            
            const maxBank = getMaxBankCapacity(userData);
            if (userData.bank + amount > maxBank) {
                return { 
                    success: false, 
                    error: 'Bank capacity exceeded',
                    current: userData.bank,
                    max: maxBank,
                    required: amount
                };
            }
            
            userData.wallet -= amount;
            userData.bank += amount;
            userData.lastDeposit = Date.now();
            
        } else if (direction === 'withdraw') {
            if (userData.bank < amount) {
                return { 
                    success: false, 
                    error: 'Insufficient funds in bank',
                    current: userData.bank,
                    required: amount
                };
            }
            
            userData.bank -= amount;
            userData.wallet += amount;
            userData.lastWithdraw = Date.now();
            
        } else {
            return { success: false, error: 'Invalid transfer direction' };
        }

        await setEconomyData(client, guildId, userId, userData);
        
        return { 
            success: true, 
            wallet: userData.wallet,
            bank: userData.bank,
            ...(direction === 'deposit' ? { maxBank: getMaxBankCapacity(userData) } : {})
        };
        
    } catch (error) {
        logger.error(`Error transferring money (${direction}) for user ${userId} in guild ${guildId}:`, error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

/**
 * Check if a user is on cooldown for a specific action
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {string} action - The action to check cooldown for
 * @param {number} cooldownTime - The cooldown time in milliseconds
 * @returns {Promise<{onCooldown: boolean, timeLeft?: number}>} Cooldown status
 */
export async function checkCooldown(client, guildId, userId, action, cooldownTime) {
    try {
        const userData = await getEconomyData(client, guildId, userId);
        const now = Date.now();
        const lastAction = userData.lastAction || {};
        const lastTime = lastAction[action] || 0;
        const timeLeft = (lastTime + cooldownTime) - now;
        
        if (timeLeft > 0) {
            return { onCooldown: true, timeLeft };
        }
        
        lastAction[action] = now;
        userData.lastAction = lastAction;
        await setEconomyData(client, guildId, userId, userData);
        
        return { onCooldown: false };
        
    } catch (error) {
        logger.error(`Error checking cooldown for ${action} for user ${userId} in guild ${guildId}:`, error);
        return { onCooldown: true, timeLeft: cooldownTime };
    }
}



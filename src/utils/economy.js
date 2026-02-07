import { getColor } from './database.js';
import { BotConfig } from '../config/bot.js';

const ECONOMY_CONFIG = BotConfig.economy || {};
const BASE_BANK_CAPACITY = ECONOMY_CONFIG.baseBankCapacity || 10000;
const BANK_CAPACITY_PER_LEVEL = ECONOMY_CONFIG.bankCapacityPerLevel || 5000;
const DAILY_AMOUNT = ECONOMY_CONFIG.dailyAmount || 100;
const WORK_MIN = ECONOMY_CONFIG.workMin || 10;
const WORK_MAX = ECONOMY_CONFIG.workMax || 100;
const COOLDOWNS = ECONOMY_CONFIG.cooldowns || {
daily: 24 * 60 * 60 * 1000,
work: 60 * 60 * 1000,
crime: 2 * 60 * 60 * 1000,
rob: 4 * 60 * 60 * 1000,
};

/**
 * Get the economy key for a user
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {string} The economy key
 */
export function getEconomyKey(guildId, userId) {
    return `economy:${guildId}:${userId}`;
}

/**
 * Calculate the maximum bank capacity for a user
 * @param {Object} userData - The user's economy data
 * @returns {number} The maximum bank capacity
 */
export function getMaxBankCapacity(userData) {
    if (!userData) return BASE_BANK_CAPACITY;
    
    const bankLevel = userData.bankLevel || 0;
    return BASE_BANK_CAPACITY + (bankLevel * BANK_CAPACITY_PER_LEVEL);
}

/**
 * Format an amount of currency
 * @param {number} amount - The amount to format
 * @returns {string} The formatted currency string
 */
export function formatCurrency(amount) {
    return `${amount.toLocaleString()} ${ECONOMY_CONFIG.currency || 'coins'}`;
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
        if (!client.db || typeof client.db.get !== 'function') {
            throw new Error('Database not available');
        }

        const key = getEconomyKey(guildId, userId);
        const data = await client.db.get(key, {});
        
        return {
            wallet: data.wallet || 0,
            bank: data.bank || 0,
            bankLevel: data.bankLevel || 0,
            xp: data.xp || 0,
            level: data.level || 1,
            lastDaily: data.lastDaily || 0,
            lastWork: data.lastWork || 0,
            lastCrime: data.lastCrime || 0,
            lastRob: data.lastRob || 0,
            inventory: data.inventory || {},
            cooldowns: data.cooldowns || {},
            ...data
        };
    } catch (error) {
        console.error(`Error getting economy data for user ${userId}:`, error);
        return {
            wallet: 0,
            bank: 0,
            bankLevel: 0,
            xp: 0,
            level: 1,
            lastDaily: 0,
            lastWork: 0,
            lastCrime: 0,
            lastRob: 0,
            inventory: {},
            cooldowns: {}
        };
    }
}

/**
 * Save economy data for a user
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {Object} data - The data to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function setEconomyData(client, guildId, userId, data) {
    try {
        if (!client.db || typeof client.db.set !== 'function') {
            throw new Error('Database not available');
        }

        const key = getEconomyKey(guildId, userId);
        await client.db.set(key, data);
        return true;
    } catch (error) {
        console.error(`Error saving economy data for user ${userId}:`, error);
        return false;
    }
}

/**
 * Update a user's balance
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {Object} options - Update options
 * @param {number} [options.wallet] - Amount to add to wallet (can be negative)
 * @param {number} [options.bank] - Amount to add to bank (can be negative)
 * @param {number} [options.xp] - Amount of XP to add
 * @returns {Promise<Object>} The updated economy data
 */
export async function updateBalance(client, guildId, userId, options = {}) {
    const data = await getEconomyData(client, guildId, userId);
    
    if (options.wallet !== undefined) {
        data.wallet = Math.max(0, (data.wallet || 0) + options.wallet);
    }
    
    if (options.bank !== undefined) {
        const maxBank = getMaxBankCapacity(data);
        data.bank = Math.min(Math.max(0, (data.bank || 0) + options.bank), maxBank);
    }
    
    if (options.xp !== undefined) {
        data.xp = Math.max(0, (data.xp || 0) + options.xp);
        
        const xpNeeded = Math.floor(5 * Math.pow(data.level || 1, 2) + 50 * (data.level || 1) + 100);
        if (data.xp >= xpNeeded) {
            data.xp -= xpNeeded;
            data.level = (data.level || 1) + 1;
            data.leveledUp = true;
        }
    }
    
    await setEconomyData(client, guildId, userId, data);
    return data;
}

/**
 * Check if a user has a cooldown
 * @param {Object} userData - The user's economy data
 * @param {string} action - The action to check
 * @returns {Object} Cooldown information
 */
export function checkCooldown(userData, action) {
    const cooldownTime = COOLDOWNS[action] || 0;
    const lastUsed = userData[`last${action.charAt(0).toUpperCase() + action.slice(1)}`] || 0;
    const now = Date.now();
    const remaining = Math.max(0, (lastUsed + cooldownTime) - now);
    
    return {
        onCooldown: remaining > 0,
        remaining,
        formatted: formatCooldown(remaining)
    };
}

/**
 * Format a cooldown time
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string
 */
function formatCooldown(ms) {
    if (ms < 1000) return 'now';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Get a random work reward
 * @returns {Object} Work reward information
 */
export function getWorkReward() {
    const amount = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
    const jobs = [
        'worked at a fast food restaurant',
        'worked as a programmer',
        'worked as a construction worker',
        'worked as a doctor',
        'worked as a streamer',
        'worked as a YouTuber',
        'worked as a teacher',
        'worked as a cashier',
        'worked as a delivery driver',
        'worked as a freelancer'
    ];
    
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    
    return {
        amount,
        job,
        message: `You ${job} and earned ${formatCurrency(amount)}!`
    };
}

/**
 * Get a random crime outcome
 * @returns {Object} Crime outcome information
 */
export function getCrimeOutcome() {
    const outcomes = [
        {
            success: true,
            amount: Math.floor(Math.random() * 200) + 50,
            message: 'You successfully robbed a bank and got away with {amount}!' 
        },
        {
            success: true,
            amount: Math.floor(Math.random() * 100) + 20,
            message: 'You pickpocketed someone and stole {amount}!' 
        },
        {
            success: true,
            amount: Math.floor(Math.random() * 150) + 30,
            message: 'You hacked into a bank account and transferred {amount} to yourself!' 
        },
        {
            success: false,
            fine: Math.floor(Math.random() * 100) + 50,
            message: 'You got caught and had to pay a fine of {fine}!' 
        },
        {
            success: false,
            fine: Math.floor(Math.random() * 150) + 50,
            message: 'The police caught you! You paid {fine} to get out of jail.' 
        },
        {
            success: false,
            fine: 0,
            message: 'Your attempt failed, but you managed to escape!' 
        }
    ];
    
    return outcomes[Math.floor(Math.random() * outcomes.length)];
}

/**
 * Get a random rob outcome
 * @param {number} targetBalance - The target's wallet balance
 * @returns {Object} Rob outcome information
 */
export function getRobOutcome(targetBalance) {
    if (targetBalance <= 0) {
        return {
            success: false,
            amount: 0,
            message: 'The target has no money to steal!'
        };
    }
    
const success = Math.random() > 0.4;
    
    if (success) {
        const amount = Math.min(
Math.floor(Math.random() * (targetBalance * 0.3)) + 1,
            targetBalance
        );
        
        return {
            success: true,
            amount,
            message: `You successfully robbed them and got away with {amount}!`
        };
    } else {
        const fine = Math.floor(Math.random() * 200) + 100;
        
        return {
            success: false,
            amount: 0,
            fine,
            message: `You got caught! You had to pay a fine of {fine}.`
        };
    }
}

/**
 * Format a shop item
 * @param {Object} item - The item to format
 * @param {number} index - The item index
 * @returns {string} Formatted item string
 */
export function formatShopItem(item, index) {
    return `**${index + 1}.** ${item.emoji} **${item.name}** - ${formatCurrency(item.price)}\n${item.description}\n`;
}

/**
 * Get the shop inventory
 * @returns {Array} The shop items
 */
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
        console.error(`Error adding money to ${type} for user ${userId} in guild ${guildId}:`, error);
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
        console.error(`Error removing money from ${type} for user ${userId} in guild ${guildId}:`, error);
        return { success: false, error: 'An error occurred while processing your request' };
    }
}

export function getShopInventory() {
    return [
        {
            id: 'fishing_rod',
            name: 'Fishing Rod',
            emoji: '🎣',
            price: 500,
            description: 'Catch fish to sell for profit!',
            type: 'tool'
        },
        {
            id: 'hunting_rifle',
            name: 'Hunting Rifle',
            emoji: '🔫',
            price: 1000,
            description: 'Hunt animals for meat and fur!',
            type: 'tool'
        },
        {
            id: 'laptop',
            name: 'Laptop',
            emoji: '💻',
            price: 2000,
            description: 'Work as a programmer for higher pay!',
            type: 'tool',
            workMultiplier: 1.5
        },
        {
            id: 'bank_loan',
            name: 'Bank Loan',
            emoji: '🏦',
            price: 5000,
            description: 'Increases your bank capacity by 50,000!',
            type: 'upgrade',
            effect: 'bank_capacity',
            value: 50000
        },
        {
            id: 'lottery_ticket',
            name: 'Lottery Ticket',
            emoji: '🎫',
            price: 100,
            description: 'A chance to win big!',
            type: 'consumable',
            use: 'gamble'
        }
    ];
}

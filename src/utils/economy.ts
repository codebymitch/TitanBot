// economy.js

import { getColor, getEconomyKey as getEconomyStorageKey } from './database.js';
import { BotConfig } from '../config/bot.js';
import { normalizeEconomyData } from './schemas.js';
import { logger } from './logger.js';
import { validateDiscordId, validateNumber } from './validation.js';
import { DEFAULT_ECONOMY_DATA } from './constants.js';
import { createError, ErrorTypes, wrapServiceBoundary } from './errorHandler.js';
import type { NexoClient } from '../types/index.js';

/** Stored per-user economy record (`EconomyDataSchema`, passthrough). */
export interface EconomyData {
    wallet: number;
    bank: number;
    bankLevel: number;
    xp: number;
    level: number;
    dailyStreak: number;
    lastDaily: number;
    lastWeekly: number;
    lastWork: number;
    lastCrime: number;
    lastRob: number;
    lastDeposit: number;
    lastWithdraw: number;
    inventory: Record<string, number>;
    upgrades?: Record<string, boolean>;
    cooldowns: Record<string, number>;
    leveledUp?: boolean;
    [key: string]: unknown;
}

export interface ShopItem {
    id: string;
    name: string;
    emoji: string;
    price: number;
    description: string;
    type: string;
    workMultiplier?: number;
    effect?: string;
    value?: number;
    use?: string;
}

export interface BalanceChange {
    wallet?: number;
    bank?: number;
    xp?: number;
}

export interface CooldownStatus {
    onCooldown: boolean;
    remaining: number;
    formatted: string;
}

/** Economy settings read from BotConfig.economy (all optional, with fallbacks below). */
interface EconomyConfig {
    baseBankCapacity?: number;
    bankCapacityPerLevel?: number;
    dailyAmount?: number;
    workMin?: number;
    workMax?: number;
    startingBalance?: number;
    currency?: { name?: string };
    cooldowns?: Record<string, number>;
}

const ECONOMY_CONFIG: EconomyConfig = BotConfig.economy || {};
const BASE_BANK_CAPACITY = ECONOMY_CONFIG.baseBankCapacity || 10000;
const BANK_CAPACITY_PER_LEVEL = ECONOMY_CONFIG.bankCapacityPerLevel || 5000;
const DAILY_AMOUNT = ECONOMY_CONFIG.dailyAmount || 100;
const WORK_MIN = ECONOMY_CONFIG.workMin || 10;
const WORK_MAX = ECONOMY_CONFIG.workMax || 100;
const COOLDOWNS: Record<string, number> = ECONOMY_CONFIG.cooldowns || {
daily: 24 * 60 * 60 * 1000,
work: 60 * 60 * 1000,
crime: 2 * 60 * 60 * 1000,
rob: 4 * 60 * 60 * 1000,
};

export function getEconomyKey(guildId: string, userId: string): string {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    const validUserId = validateDiscordId(userId, 'userId');
    
    if (!validGuildId || !validUserId) {
        throw new Error('Invalid guild ID or user ID');
    }
    
    return getEconomyStorageKey(validGuildId, validUserId);
}

export function getMaxBankCapacity(userData: EconomyData | null | undefined): number {
    if (!userData) return BASE_BANK_CAPACITY;
    
    const bankLevel = userData.bankLevel || 0;
    let capacity = BASE_BANK_CAPACITY + (bankLevel * BANK_CAPACITY_PER_LEVEL);

    const upgrades = userData.upgrades || {};
    const inventory = userData.inventory || {};

    if (upgrades['bank_upgrade_1']) {
        capacity = Math.floor(capacity * 1.5);
    }

    const bankNotes = inventory['bank_note'] || 0;
    capacity += (bankNotes * 10000);
    
    return capacity;
}

export function formatCurrency(amount: number): string {
    const currencyName = ECONOMY_CONFIG.currency?.name || 'Münzen';
    return `${amount.toLocaleString()} ${currencyName}`;
}

export async function getEconomyData(client: NexoClient, guildId: string, userId: string): Promise<EconomyData> {
    try {
        if (!client.db || typeof client.db.get !== 'function') {
            throw new Error('Database not available');
        }

        const key = getEconomyKey(guildId, userId);
        const data = await client.db.get(key, {});
        const defaults = {
            ...DEFAULT_ECONOMY_DATA,
            wallet: ECONOMY_CONFIG.startingBalance ?? DEFAULT_ECONOMY_DATA.wallet,
        };
        
        return normalizeEconomyData(data, defaults) as EconomyData;
    } catch (error) {
        logger.error(`Error getting economy data for user ${userId}`, error);
        return normalizeEconomyData({}, DEFAULT_ECONOMY_DATA) as EconomyData;
    }
}

export async function setEconomyData(client: NexoClient, guildId: string, userId: string, data: EconomyData): Promise<boolean> {
    try {
        if (!client.db || typeof client.db.set !== 'function') {
            throw new Error('Database not available');
        }

        const key = getEconomyKey(guildId, userId);
        const normalized = normalizeEconomyData(data, DEFAULT_ECONOMY_DATA);
        await client.db.set(key, normalized);
        return true;
    } catch (error) {
        logger.error(`Error saving economy data for user ${userId}`, error);
        return false;
    }
}

export async function updateBalance(
    client: NexoClient,
    guildId: string,
    userId: string,
    options: BalanceChange = {}
): Promise<EconomyData> {
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

export function checkCooldown(userData: EconomyData, action: string): CooldownStatus {
    const cooldownTime = COOLDOWNS[action] || 0;
    const lastUsed = (userData[`last${action.charAt(0).toUpperCase() + action.slice(1)}`] as number | undefined) || 0;
    const now = Date.now();
    const remaining = Math.max(0, (lastUsed + cooldownTime) - now);
    
    return {
        onCooldown: remaining > 0,
        remaining,
        formatted: formatCooldown(remaining)
    };
}

function formatCooldown(ms: number): string {
    if (ms < 1000) return 'jetzt';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

export function getWorkReward() {
    const amount = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
    const jobs = [
        'in einem Fast-Food-Restaurant gearbeitet',
        'als Programmierer gearbeitet',
        'auf dem Bau gearbeitet',
        'als Ärztin bzw. Arzt gearbeitet',
        'als Streamer gearbeitet',
        'als YouTuber gearbeitet',
        'als Lehrkraft gearbeitet',
        'an der Kasse gearbeitet',
        'als Lieferfahrer gearbeitet',
        'als Freelancer gearbeitet'
    ];
    
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    
    return {
        amount,
        job,
        message: `Du hast ${job} und ${formatCurrency(amount)} verdient!`
    };
}

export function getCrimeOutcome() {
    const outcomes = [
        {
            success: true,
            amount: Math.floor(Math.random() * 200) + 50,
            message: 'Du hast erfolgreich eine Bank ausgeraubt und bist mit {amount} entkommen!' 
        },
        {
            success: true,
            amount: Math.floor(Math.random() * 100) + 20,
            message: 'Du hast jemandem die Taschen geleert und {amount} erbeutet!' 
        },
        {
            success: true,
            amount: Math.floor(Math.random() * 150) + 30,
            message: 'Du hast ein Bankkonto gehackt und dir {amount} überwiesen!' 
        },
        {
            success: false,
            fine: Math.floor(Math.random() * 100) + 50,
            message: 'Du wurdest erwischt und musstest {fine} Strafe zahlen!' 
        },
        {
            success: false,
            fine: Math.floor(Math.random() * 150) + 50,
            message: 'Die Polizei hat dich geschnappt! Du hast {fine} gezahlt, um aus dem Gefängnis zu kommen.' 
        },
        {
            success: false,
            fine: 0,
            message: 'Dein Versuch ist gescheitert, aber du konntest entkommen!' 
        }
    ];
    
    return outcomes[Math.floor(Math.random() * outcomes.length)];
}

export function getRobOutcome(targetBalance: number) {
    if (targetBalance <= 0) {
        return {
            success: false,
            amount: 0,
            message: 'Bei deinem Ziel gibt es kein Geld zu holen!'
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
            message: `Du hast dein Ziel erfolgreich ausgeraubt und bist mit {amount} entkommen!`
        };
    } else {
        const fine = Math.floor(Math.random() * 200) + 100;
        
        return {
            success: false,
            amount: 0,
            fine,
            message: `Du wurdest erwischt! Du musstest {fine} Strafe zahlen.`
        };
    }
}

export function formatShopItem(item: Pick<ShopItem, 'emoji' | 'name' | 'price' | 'description'>, index: number): string {
    return `**${index + 1}.** ${item.emoji} **${item.name}** - ${formatCurrency(item.price)}\n${item.description}\n`;
}

export const addMoney = wrapServiceBoundary(async function addMoney(client: NexoClient, guildId: string, userId: string, amount: number, type = 'wallet') {
    const validAmount = validateNumber(amount, 'amount');
    if (validAmount === null || validAmount <= 0) {
        throw createError(
            'Invalid amount',
            ErrorTypes.VALIDATION,
            'Der Betrag muss eine positive Zahl sein.',
            { guildId, userId, amount, operation: 'addMoney' }
        );
    }

    if (type !== 'wallet' && type !== 'bank') {
        throw createError(
            'Invalid money type',
            ErrorTypes.VALIDATION,
            'Der Typ muss "wallet" oder "bank" sein.',
            { guildId, userId, type, operation: 'addMoney' }
        );
    }

    const userData = await getEconomyData(client, guildId, userId);

    if (type === 'bank') {
        const maxBank = getMaxBankCapacity(userData);
        if ((userData.bank || 0) + validAmount > maxBank) {
            throw createError(
                'Bank capacity exceeded',
                ErrorTypes.VALIDATION,
                `Bankkapazität überschritten. Aktuell: ${userData.bank || 0}, Maximum: ${maxBank}.`,
                { guildId, userId, current: userData.bank || 0, max: maxBank, operation: 'addMoney' }
            );
        }
        userData.bank = (userData.bank || 0) + validAmount;
    } else {
        userData.wallet = (userData.wallet || 0) + validAmount;
    }

    await setEconomyData(client, guildId, userId, userData);

    return {
        newBalance: type === 'bank' ? userData.bank : userData.wallet,
        ...(type === 'bank' ? { maxBank: getMaxBankCapacity(userData) } : {}),
    };
}, {
    service: 'economy',
    operation: 'addMoney',
    userMessage: 'Geld konnte nicht hinzugefügt werden. Bitte versuch es erneut.',
});

export const removeMoney = wrapServiceBoundary(async function removeMoney(client: NexoClient, guildId: string, userId: string, amount: number, type = 'wallet') {
    const validAmount = validateNumber(amount, 'amount');
    if (validAmount === null || validAmount <= 0) {
        throw createError(
            'Invalid amount',
            ErrorTypes.VALIDATION,
            'Der Betrag muss eine positive Zahl sein.',
            { guildId, userId, amount, operation: 'removeMoney' }
        );
    }

    if (type !== 'wallet' && type !== 'bank') {
        throw createError(
            'Invalid money type',
            ErrorTypes.VALIDATION,
            'Der Typ muss "wallet" oder "bank" sein.',
            { guildId, userId, type, operation: 'removeMoney' }
        );
    }

    const userData = await getEconomyData(client, guildId, userId);

    if (type === 'bank') {
        if ((userData.bank || 0) < validAmount) {
            throw createError(
                'Insufficient bank funds',
                ErrorTypes.VALIDATION,
                `Nicht genug Geld auf der Bank. Du hast ${userData.bank || 0}, brauchst aber ${validAmount}.`,
                { guildId, userId, current: userData.bank || 0, required: validAmount, operation: 'removeMoney' }
            );
        }
        userData.bank = (userData.bank || 0) - validAmount;
    } else {
        if ((userData.wallet || 0) < validAmount) {
            throw createError(
                'Insufficient wallet funds',
                ErrorTypes.VALIDATION,
                `Nicht genug Geld in der Geldbörse. Du hast ${userData.wallet || 0}, brauchst aber ${validAmount}.`,
                { guildId, userId, current: userData.wallet || 0, required: validAmount, operation: 'removeMoney' }
            );
        }
        userData.wallet = (userData.wallet || 0) - validAmount;
    }

    await setEconomyData(client, guildId, userId, userData);

    return {
        newBalance: type === 'bank' ? userData.bank : userData.wallet,
    };
}, {
    service: 'economy',
    operation: 'removeMoney',
    userMessage: 'Geld konnte nicht abgezogen werden. Bitte versuch es erneut.',
});

export function getShopInventory(): ShopItem[] {
    return [
        {
            id: 'fishing_rod',
            name: 'Angel',
            emoji: '🎣',
            price: 500,
            description: 'Fang Fische und verkaufe sie mit Gewinn!',
            type: 'tool'
        },
        {
            id: 'hunting_rifle',
            name: 'Jagdgewehr',
            emoji: '🔫',
            price: 1000,
            description: 'Jage Tiere für Fleisch und Fell!',
            type: 'tool'
        },
        {
            id: 'laptop',
            name: 'Laptop',
            emoji: '💻',
            price: 2000,
            description: 'Arbeite als Programmierer für mehr Lohn!',
            type: 'tool',
            workMultiplier: 1.5
        },
        {
            id: 'bank_loan',
            name: 'Bankkredit',
            emoji: '🏦',
            price: 5000,
            description: 'Erhöht deine Bankkapazität um 50.000!',
            type: 'upgrade',
            effect: 'bank_capacity',
            value: 50000
        },
        {
            id: 'lottery_ticket',
            name: 'Lotterielos',
            emoji: '🎫',
            price: 100,
            description: 'Deine Chance auf den großen Gewinn!',
            type: 'consumable',
            use: 'gamble'
        }
    ];
}
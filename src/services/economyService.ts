// economyService.js

import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../utils/economy.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { wrapServiceClassMethods } from '../utils/serviceErrorBoundary.js';
import type { ErrorContext } from '../utils/errorHandler.js';
import type { EconomyData } from '../utils/economy.js';
import type { NexoClient } from '../types/index.js';

class EconomyService {

  static DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
  static WORK_COOLDOWN = 30 * 60 * 1000;
  static GAMBLE_COOLDOWN = 5 * 60 * 1000;
  static CRIME_COOLDOWN = 60 * 60 * 1000;
  static ROB_COOLDOWN = 4 * 60 * 60 * 1000;
  static MINE_COOLDOWN = 60 * 60 * 1000;
  static FISH_COOLDOWN = 45 * 60 * 1000;
  static BEG_COOLDOWN = 30 * 60 * 1000;
  
  static DAILY_AMOUNT = 1000;
  static MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

  static assertSafeBalance(value: number, context: ErrorContext = {}): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > this.MAX_SAFE_INTEGER) {
      throw createError(
        "Invalid balance state",
        ErrorTypes.VALIDATION,
        "Dieser Vorgang würde einen ungültigen Kontostand erzeugen.",
        { value, ...context }
      );
    }
  }

  static async claimDaily(client: NexoClient, guildId: string, userId: string) {
    logger.debug(`[ECONOMY_SERVICE] claimDaily requested`, { userId, guildId });
    
    const userData = await getEconomyData(client, guildId, userId);
    if (!userData) {
      logger.error(`[ECONOMY_SERVICE] Failed to load economy data for daily`);
      throw createError(
        "Failed to load economy data",
        ErrorTypes.DATABASE,
        "Deine Economy-Daten konnten nicht geladen werden. Bitte versuch es später erneut.",
        { userId, guildId }
      );
    }

    const now = Date.now();
    const lastDaily = userData.lastDaily || 0;
    const remaining = lastDaily + this.DAILY_COOLDOWN - now;

    if (remaining > 0) {
      logger.warn(`[ECONOMY_SERVICE] Daily cooldown active`, {
        userId,
        timeRemaining: remaining
      });
      throw createError(
        "Daily cooldown active",
        ErrorTypes.RATE_LIMIT,
        `Du musst noch warten, bevor du deine tägliche Belohnung wieder abholen kannst. Versuch es in **${this.formatDuration(remaining)}** erneut.`,
        { remaining, cooldownType: 'daily' }
      );
    }

    const earned = this.DAILY_AMOUNT;
    const nextWallet = (userData.wallet || 0) + earned;
    this.assertSafeBalance(nextWallet, { operation: 'claimDaily', userId, guildId });
    userData.wallet = nextWallet;
    userData.lastDaily = now;

    try {
      await setEconomyData(client, guildId, userId, userData);
      
      logger.info(`[ECONOMY_TRANSACTION] Daily claimed`, {
        userId,
        guildId,
        amount: earned,
        newWallet: userData.wallet,
        timestamp: new Date().toISOString(),
        source: 'claim_daily'
      });

      return {
        earned,
        newWallet: userData.wallet,
        nextClaimTime: new Date(now + this.DAILY_COOLDOWN)
      };
    } catch (error) {
      logger.error(`[ECONOMY_SERVICE] Failed to save daily claim`, error, {
        userId,
        guildId,
        amount: earned
      });
      throw createError(
        "Failed to save daily claim",
        ErrorTypes.DATABASE,
        "Deine tägliche Belohnung konnte nicht verarbeitet werden. Bitte versuch es erneut.",
        { userId, guildId }
      );
    }
  }

  static async transferMoney(client: NexoClient, guildId: string, senderId: string, receiverId: string, amount: number) {
    logger.debug(`[ECONOMY_SERVICE] transferMoney requested`, {
      senderId,
      receiverId,
      amount,
      guildId
    });

    if (amount <= 0) {
      throw createError(
        "Invalid transfer amount",
        ErrorTypes.VALIDATION,
        "Der Betrag muss größer als null sein.",
        { amount, senderId }
      );
    }

    if (senderId === receiverId) {
      throw createError(
        "Cannot pay self",
        ErrorTypes.VALIDATION,
        "Du kannst dir nicht selbst Geld schicken.",
        { senderId, receiverId }
      );
    }

    this.validateAmount(amount, { operation: 'transfer', senderId, receiverId });

    const [senderData, receiverData] = await Promise.all([
      getEconomyData(client, guildId, senderId),
      getEconomyData(client, guildId, receiverId)
    ]);

    if (!senderData || !receiverData) {
      logger.error(`[ECONOMY_SERVICE] Failed to load economy data for transfer`, {
        senderLoaded: !!senderData,
        receiverLoaded: !!receiverData
      });
      throw createError(
        "Failed to load economy data",
        ErrorTypes.DATABASE,
        "Die Economy-Daten konnten nicht geladen werden. Bitte versuch es später erneut.",
        { senderId, receiverId, guildId }
      );
    }

    if (senderData.wallet < amount) {
      logger.warn(`[ECONOMY_SERVICE] Insufficient funds for transfer`, {
        senderId,
        required: amount,
        available: senderData.wallet
      });
      throw createError(
        "Insufficient funds",
        ErrorTypes.VALIDATION,
        `Du hast nur **$${senderData.wallet.toLocaleString()}** in deiner Geldbörse.`,
        { required: amount, available: senderData.wallet, senderId }
      );
    }

    const walletBefore = senderData.wallet;
    const senderNext = (senderData.wallet || 0) - amount;
    const receiverNext = (receiverData.wallet || 0) + amount;

    this.assertSafeBalance(senderNext, { operation: 'transfer.sender', senderId, amount });
    this.assertSafeBalance(receiverNext, { operation: 'transfer.receiver', receiverId, amount });

    senderData.wallet = senderNext;
    receiverData.wallet = receiverNext;

    try {
      
      await setEconomyData(client, guildId, senderId, senderData);
      
      try {
        
        await setEconomyData(client, guildId, receiverId, receiverData);
      } catch (receiverError) {
        
        logger.error(`[ECONOMY_CRITICAL] Failed to credit receiver ${receiverId}. Attempting rollback for sender ${senderId}...`, receiverError);
        
        senderData.wallet = walletBefore;
        try {
          await setEconomyData(client, guildId, senderId, senderData);
          logger.info(`[ECONOMY_ROLLBACK] Successfully rolled back sender ${senderId} after receiver credit failure.`);
        } catch (rollbackError) {
          logger.error(`[ECONOMY_FATAL] ROLLBACK FAILED for sender ${senderId}! Data is now inconsistent.`, rollbackError);
          
        }
        
        throw receiverError;
      }

      logger.info(`[ECONOMY_TRANSACTION] Money transferred`, {
        type: 'transfer',
        senderId,
        receiverId,
        guildId,
        amount,
        senderNewBalance: senderData.wallet,
        receiverNewBalance: receiverData.wallet,
        timestamp: new Date().toISOString()
      });

      return {
        senderNewBalance: senderData.wallet,
        receiverNewBalance: receiverData.wallet
      };
    } catch (error) {
      logger.error(`[ECONOMY_SERVICE] Transfer execution failed, DATA MAY BE INCONSISTENT`, error, {
        senderId,
        receiverId,
        amount,
        guildId,
        senderBefore: walletBefore,
        senderAfter: senderData.wallet,
        receiverAfter: receiverData.wallet
      });
      throw createError(
        "Failed to save transfer",
        ErrorTypes.DATABASE,
        "Die Überweisung konnte nicht verarbeitet werden. Bitte versuch es erneut.",
        { senderId, receiverId, amount }
      );
    }
  }

  static async addMoney(client: NexoClient, guildId: string, userId: string, amount: number, source = 'unknown'): Promise<EconomyData> {
    if (amount <= 0) {
      throw createError(
        "Invalid amount",
        ErrorTypes.VALIDATION,
        "Der Betrag muss positiv sein.",
        { amount, userId, source }
      );
    }

    this.validateAmount(amount, { operation: 'addMoney', userId, source });

    const userData = await getEconomyData(client, guildId, userId);
    const balanceBefore = userData.wallet || 0;
    const nextWallet = balanceBefore + amount;
    this.assertSafeBalance(nextWallet, { operation: 'addMoney', userId, source, amount });
    userData.wallet = nextWallet;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Money added`, {
      userId,
      guildId,
      amount,
      source,
      balanceBefore,
      balanceAfter: userData.wallet,
      delta: amount,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async removeMoney(client: NexoClient, guildId: string, userId: string, amount: number, reason = 'unknown'): Promise<EconomyData> {
    if (amount <= 0) {
      throw createError(
        "Invalid amount",
        ErrorTypes.VALIDATION,
        "Der Betrag muss positiv sein.",
        { amount, userId, reason }
      );
    }

    this.validateAmount(amount, { operation: 'removeMoney', userId, reason });

    const userData = await getEconomyData(client, guildId, userId);
    const balanceBefore = userData.wallet || 0;

    if (balanceBefore < amount) {
      throw createError(
        "Insufficient funds",
        ErrorTypes.VALIDATION,
        `Du hast nur **$${balanceBefore.toLocaleString()}**.`,
        { required: amount, available: balanceBefore, reason }
      );
    }

    userData.wallet = balanceBefore - amount;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Money removed`, {
      userId,
      guildId,
      amount,
      reason,
      balanceBefore,
      balanceAfter: userData.wallet,
      delta: -amount,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async depositToBank(client: NexoClient, guildId: string, userId: string, amount: number): Promise<EconomyData> {
    this.validateAmount(amount, { operation: 'deposit', userId });

    const userData = await getEconomyData(client, guildId, userId);
    const maxBank = getMaxBankCapacity(userData);

    if (userData.wallet < amount) {
      throw createError(
        "Insufficient cash",
        ErrorTypes.VALIDATION,
        `Du hast nur **$${userData.wallet.toLocaleString()}** in deiner Geldbörse.`,
        { required: amount, available: userData.wallet }
      );
    }

    const currentBank = userData.bank || 0;
    if (currentBank + amount > maxBank) {
      throw createError(
        "Bank capacity exceeded",
        ErrorTypes.VALIDATION,
        `Deine Bank fasst nur **$${maxBank.toLocaleString()}**. Du würdest das Limit um **$${(currentBank + amount - maxBank).toLocaleString()}** überschreiten.`,
        { capacity: maxBank, current: currentBank, requested: amount }
      );
    }

    const nextWallet = userData.wallet - amount;
    const nextBank = (userData.bank || 0) + amount;

    this.assertSafeBalance(nextWallet, { operation: 'deposit.wallet', userId, amount });
    this.assertSafeBalance(nextBank, { operation: 'deposit.bank', userId, amount });

    userData.wallet = nextWallet;
    userData.bank = nextBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Money deposited to bank`, {
      userId,
      guildId,
      amount,
      walletAfter: userData.wallet,
      bankAfter: userData.bank,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async withdrawFromBank(client: NexoClient, guildId: string, userId: string, amount: number): Promise<EconomyData> {
    this.validateAmount(amount, { operation: 'withdraw', userId });

    const userData = await getEconomyData(client, guildId, userId);
    const bank = userData.bank || 0;

    if (bank < amount) {
      throw createError(
        "Insufficient bank balance",
        ErrorTypes.VALIDATION,
        `Du hast nur **$${bank.toLocaleString()}** auf deiner Bank.`,
        { required: amount, available: bank }
      );
    }

    const nextWallet = (userData.wallet || 0) + amount;
    const nextBank = bank - amount;

    this.assertSafeBalance(nextWallet, { operation: 'withdraw.wallet', userId, amount });
    this.assertSafeBalance(nextBank, { operation: 'withdraw.bank', userId, amount });

    userData.wallet = nextWallet;
    userData.bank = nextBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Money withdrawn from bank`, {
      userId,
      guildId,
      amount,
      walletAfter: userData.wallet,
      bankAfter: userData.bank,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static checkCooldown(userData: EconomyData, action: string, cooldownMs: number) {
    const lastActionField = `last${action.charAt(0).toUpperCase() + action.slice(1)}`;
    const lastTime = (userData[lastActionField] as number | undefined) || 0;
    const now = Date.now();
    const remaining = Math.max(0, lastTime + cooldownMs - now);

    return {
      isOnCooldown: remaining > 0,
      remaining,
      formatted: this.formatDuration(remaining),
      nextAvailable: new Date(lastTime + cooldownMs)
    };
  }

  static validateAmount(amount: number, context: ErrorContext = {}): void {
    if (!Number.isInteger(amount)) {
      throw createError(
        "Invalid amount - not an integer",
        ErrorTypes.VALIDATION,
        "Der Betrag muss eine ganze Zahl sein.",
        context
      );
    }

    if (amount <= 0) {
      throw createError(
        "Invalid amount - not positive",
        ErrorTypes.VALIDATION,
        "Der Betrag muss positiv sein.",
        context
      );
    }

    if (amount > this.MAX_SAFE_INTEGER) {
      logger.error(`[ECONOMY] Amount exceeds MAX_SAFE_INTEGER`, { amount, context });
      throw createError(
        "Amount too large",
        ErrorTypes.VALIDATION,
        "Der Betrag ist zu groß.",
        context
      );
    }
  }

  static formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  static formatCooldownDisplay(ms: number): string {
    const duration = this.formatDuration(ms);
    return `**${duration}**`;
  }
}

wrapServiceClassMethods(EconomyService, (methodName) => ({
  service: 'EconomyService',
  operation: methodName,
  message: `Economy service operation failed: ${methodName}`,
  userMessage: 'Ein Economy-Vorgang ist fehlgeschlagen. Bitte versuch es gleich noch mal.'
}));

export default EconomyService;
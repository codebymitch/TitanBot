// birthdayService.js

import { getGuildConfig } from './config/guildConfig.js';
import { getGuildBirthdays, setBirthday as dbSetBirthday, deleteBirthday as dbDeleteBirthday, getMonthName, getBirthdayTrackingKey } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../utils/errorHandler.js';
import type { GuildMember, GuildTextBasedChannel } from 'discord.js';
import type { NexoClient } from '../types/index.js';

export type BirthdayValidation = { isValid: true } | { isValid: false; error: string };

export function validateBirthday(month: unknown, day: unknown): BirthdayValidation {
  
  if (typeof month !== 'number' || typeof day !== 'number') {
    return {
      isValid: false,
      error: 'Monat und Tag müssen Zahlen sein.'
    };
  }

  if (month < 1 || month > 12) {
    return {
      isValid: false,
      error: 'Der Monat muss zwischen 1 und 12 liegen.'
    };
  }

  if (day < 1 || day > 31) {
    return {
      isValid: false,
      error: 'Der Tag muss zwischen 1 und 31 liegen.'
    };
  }

  const currentYear = new Date().getFullYear();
  const date = new Date(currentYear, month - 1, day);
  
  if (isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return {
      isValid: false,
      error: 'Ungültiges Datum. Bitte prüfe die Kombination aus Monat und Tag (z. B. gibt es den 29. Februar nur in Schaltjahren).'
    };
  }

  return { isValid: true };
}

export async function setBirthday(client: NexoClient, guildId: string, userId: string, month: number, day: number) {
  try {
    
    const validation = validateBirthday(month, day);
    if (!validation.isValid) {
      logger.warn('Birthday validation failed', {
        userId,
        guildId,
        month,
        day,
        error: validation.error
      });
      
      throw new NexoBotError(
        validation.error,
        ErrorTypes.VALIDATION,
        validation.error,
        { month, day, userId, guildId }
      );
    }

    const success = await dbSetBirthday(client, guildId, userId, month, day);
    
    if (!success) {
      throw new NexoBotError(
        'Failed to save birthday to database',
        ErrorTypes.DATABASE,
        'Dein Geburtstag konnte nicht gespeichert werden. Bitte versuch es später erneut.',
        { userId, guildId, month, day }
      );
    }

    logger.info('Birthday set successfully', {
      userId,
      guildId,
      month,
      day,
      monthName: getMonthName(month)
    });

    return {
      data: {
        month,
        day,
        monthName: getMonthName(month)
      }
    };
  } catch (error) {
    logger.error('Error in setBirthday service', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      userId,
      guildId,
      month,
      day
    });
    
    throw error;
  }
}

export async function getUserBirthday(client: NexoClient, guildId: string, userId: string) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    const birthdayData = birthdays[userId];
    
    if (!birthdayData) {
      return null;
    }

    return {
      month: birthdayData.month,
      day: birthdayData.day,
      monthName: getMonthName(birthdayData.month)
    };
  } catch (error) {
    logger.error('Error in getUserBirthday service', {
      error: (error as Error).message,
      userId,
      guildId
    });
    throw error;
  }
}

export async function getAllBirthdays(client: NexoClient, guildId: string) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    
    if (!birthdays || Object.keys(birthdays).length === 0) {
      return [];
    }

    const sortedBirthdays = Object.entries(birthdays)
      .map(([userId, data]) => ({
        userId,
        month: data.month,
        day: data.day,
        monthName: getMonthName(data.month)
      }))
      .sort((a, b) => {
        if (a.month !== b.month) return a.month - b.month;
        return a.day - b.day;
      });

    return sortedBirthdays;
  } catch (error) {
    logger.error('Error in getAllBirthdays service', {
      error: (error as Error).message,
      guildId
    });
    throw error;
  }
}

export async function deleteBirthday(client: NexoClient, guildId: string, userId: string) {
  try {
    
    const birthday = await getUserBirthday(client, guildId, userId);
    
    if (!birthday) {
      return {
        status: 'not_found',
      };
    }

    const success = await dbDeleteBirthday(client, guildId, userId);
    
    if (!success) {
      throw new NexoBotError(
        'Failed to delete birthday from database',
        ErrorTypes.DATABASE,
        'Dein Geburtstag konnte nicht entfernt werden. Bitte versuch es erneut.',
        { userId, guildId }
      );
    }

    logger.info('Birthday removed successfully', {
      userId,
      guildId
    });

    return {
      status: 'removed',
    };
  } catch (error) {
    logger.error('Error in deleteBirthday service', {
      error: (error as Error).message,
      userId,
      guildId
    });
    throw error;
  }
}

export async function getUpcomingBirthdays(client: NexoClient, guildId: string, limit = 5) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    
    if (!birthdays || Object.keys(birthdays).length === 0) {
      return [];
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    
    const upcomingBirthdays: Array<{
      userId: string;
      month: number;
      day: number;
      monthName: string;
      date: Date;
      daysUntil: number;
    }> = [];
    
    for (const [userId, userData] of Object.entries(birthdays)) {
      let nextBirthday = new Date(currentYear, userData.month - 1, userData.day);

      if (nextBirthday < today) {
        nextBirthday = new Date(currentYear + 1, userData.month - 1, userData.day);
      }
      
      const daysUntil = Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      upcomingBirthdays.push({
        userId,
        month: userData.month,
        day: userData.day,
        monthName: getMonthName(userData.month),
        date: nextBirthday,
        daysUntil
      });
    }

    upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

    return upcomingBirthdays.slice(0, limit);
  } catch (error) {
    logger.error('Error in getUpcomingBirthdays service', {
      error: (error as Error).message,
      guildId,
      limit
    });
    throw error;
  }
}

export async function getTodaysBirthdays(client: NexoClient, guildId: string) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    const today = new Date();
    const currentMonth = today.getUTCMonth() + 1;
    const currentDay = today.getUTCDate();

    const todaysBirthdays: Array<{ userId: string; month: number; day: number; monthName: string }> = [];

    for (const [userId, userData] of Object.entries(birthdays)) {
      if (userData.month === currentMonth && userData.day === currentDay) {
        todaysBirthdays.push({
          userId,
          month: userData.month,
          day: userData.day,
          monthName: getMonthName(userData.month)
        });
      }
    }

    return todaysBirthdays;
  } catch (error) {
    logger.error('Error in getTodaysBirthdays service', {
      error: (error as Error).message,
      guildId
    });
    throw error;
  }
}

export async function checkBirthdays(client: NexoClient): Promise<void> {
  const today = new Date();
  const currentMonth = today.getUTCMonth() + 1;
  const currentDay = today.getUTCDate();

  if (process.env.NODE_ENV !== 'production') {
    logger.debug(`🎂 Running daily birthday check for UTC: ${currentMonth}/${currentDay}.`);
  }

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const config = await getGuildConfig(client, guildId);
      const { birthdayChannelId, birthdayRoleId } = config;

      // A channel is required for announcements; the birthday role is optional.
      if (!birthdayChannelId) {
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Skipping birthday check for ${guild.name}: Missing channel config.`);
        }
        continue;
      }

      // Not narrowed in the original: a non-text channel throws on send and is logged below.
      const channel = await guild.channels.fetch(birthdayChannelId).catch(() => null) as GuildTextBasedChannel | null;
      if (!channel) continue;

      const trackingKey = getBirthdayTrackingKey(guildId);
      const trackingData = (await client.db.get<Record<string, boolean>>(trackingKey)) || {};
      const updatedTrackingData = { ...trackingData };
      
      for (const userId of Object.keys(trackingData)) {
        try {
          if (birthdayRoleId) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member && member.roles.cache.has(birthdayRoleId)) {
              await member.roles.remove(birthdayRoleId, "Geburtstagsrolle abgelaufen");
            }
          }
          delete updatedTrackingData[userId];
        } catch (error) {
           logger.error(`Error removing birthday role from ${userId}:`, error);
        }
      }

      if (Object.keys(updatedTrackingData).length !== Object.keys(trackingData).length) {
        await client.db.set(trackingKey, updatedTrackingData);
      }

      // Use the canonical birthday storage (guild:<id>:birthdays) that set/remove commands write to.
      const birthdays = (await getGuildBirthdays(client, guildId)) || {};
      const birthdayMembers: GuildMember[] = [];
      for (const [userId, userData] of Object.entries(birthdays)) {
        if (userData.month === currentMonth && userData.day === currentDay) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            birthdayMembers.push(member);
            if (birthdayRoleId) {
              try {
                await member.roles.add(birthdayRoleId, "Alles Gute zum Geburtstag! 🎉");
                updatedTrackingData[userId] = true;
              } catch (error) {
                  logger.error(`Error adding birthday role to ${member.user.tag}:`, error);
              }
            }
          }
        }
      }

      if (birthdayMembers.length > 0) {
        await client.db.set(trackingKey, updatedTrackingData);
        const mentionList = birthdayMembers.map(m => m.toString()).join(', ');
        
        await channel.send({
          embeds: [{
            title: '🎉 Alles Gute zum Geburtstag! 🎂',
            description: `Alles Liebe zum Geburtstag, ${mentionList}! Auf einen großartigen Tag! 🎈`,
            color: 0xff69b4,
            footer: { text: 'Nexo Geburtstage' },
            timestamp: new Date().toISOString()
          }]
        });
      }
    } catch (error) {
      logger.error(`Error processing birthdays for guild ${guildId}:`, error);
    }
  }
}
import { getGuildConfig } from './guildConfig.js';
import { getGuildBirthdays, setBirthday as dbSetBirthday, deleteBirthday as dbDeleteBirthday, getMonthName } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';

/**
 * Validate a birthday date
 * @param {number} month - Month (1-12)
 * @param {number} day - Day (1-31)
 * @returns {Object} Validation result with isValid and error properties
 */
export function validateBirthday(month, day) {
  // Check if month and day are numbers
  if (typeof month !== 'number' || typeof day !== 'number') {
    return {
      isValid: false,
      error: 'Month and day must be numbers'
    };
  }

  // Check month range
  if (month < 1 || month > 12) {
    return {
      isValid: false,
      error: 'Month must be between 1 and 12'
    };
  }

  // Check day range
  if (day < 1 || day > 31) {
    return {
      isValid: false,
      error: 'Day must be between 1 and 31'
    };
  }

  // Validate the date exists (e.g., no February 30th)
  const currentYear = new Date().getFullYear();
  const date = new Date(currentYear, month - 1, day);
  
  if (isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return {
      isValid: false,
      error: 'Invalid date. Please check the month and day combination (e.g., February 29th only exists in leap years)'
    };
  }

  return { isValid: true };
}

/**
 * Set a user's birthday with validation
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} month - Month (1-12)
 * @param {number} day - Day (1-31)
 * @returns {Promise<Object>} Result object with success, data, and error properties
 */
export async function setBirthday(client, guildId, userId, month, day) {
  try {
    // Validate input
    const validation = validateBirthday(month, day);
    if (!validation.isValid) {
      logger.warn('Birthday validation failed', {
        userId,
        guildId,
        month,
        day,
        error: validation.error
      });
      
      throw new TitanBotError(
        validation.error,
        ErrorTypes.VALIDATION,
        validation.error,
        { month, day, userId, guildId }
      );
    }

    // Set birthday in database
    const success = await dbSetBirthday(client, guildId, userId, month, day);
    
    if (!success) {
      throw new TitanBotError(
        'Failed to save birthday to database',
        ErrorTypes.DATABASE,
        'Failed to set your birthday. Please try again later.',
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
      success: true,
      data: {
        month,
        day,
        monthName: getMonthName(month)
      }
    };
  } catch (error) {
    logger.error('Error in setBirthday service', {
      error: error.message,
      stack: error.stack,
      userId,
      guildId,
      month,
      day
    });
    
    throw error;
  }
}

/**
 * Get a user's birthday
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Birthday data or null if not found
 */
export async function getUserBirthday(client, guildId, userId) {
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
      error: error.message,
      userId,
      guildId
    });
    throw error;
  }
}

/**
 * Get all birthdays in a guild with sorting
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @returns {Promise<Array>} Sorted array of birthday objects
 */
export async function getAllBirthdays(client, guildId) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    
    if (!birthdays || Object.keys(birthdays).length === 0) {
      return [];
    }

    // Transform and sort
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
      error: error.message,
      guildId
    });
    throw error;
  }
}

/**
 * Delete a user's birthday
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result object with success property
 */
export async function deleteBirthday(client, guildId, userId) {
  try {
    // Check if birthday exists first
    const birthday = await getUserBirthday(client, guildId, userId);
    
    if (!birthday) {
      return {
        success: false,
        notFound: true,
        message: 'No birthday found to remove'
      };
    }

    const success = await dbDeleteBirthday(client, guildId, userId);
    
    if (!success) {
      throw new TitanBotError(
        'Failed to delete birthday from database',
        ErrorTypes.DATABASE,
        'Failed to remove your birthday. Please try again.',
        { userId, guildId }
      );
    }

    logger.info('Birthday removed successfully', {
      userId,
      guildId
    });

    return {
      success: true,
      message: 'Birthday removed successfully'
    };
  } catch (error) {
    logger.error('Error in deleteBirthday service', {
      error: error.message,
      userId,
      guildId
    });
    throw error;
  }
}

/**
 * Get upcoming birthdays
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {number} limit - Maximum number of birthdays to return (default: 5)
 * @returns {Promise<Array>} Array of upcoming birthdays
 */
export async function getUpcomingBirthdays(client, guildId, limit = 5) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    
    if (!birthdays || Object.keys(birthdays).length === 0) {
      return [];
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    
    const upcomingBirthdays = [];
    
    for (const [userId, userData] of Object.entries(birthdays)) {
      let nextBirthday = new Date(currentYear, userData.month - 1, userData.day);
      
      // If birthday has passed this year, use next year's date
      if (nextBirthday < today) {
        nextBirthday = new Date(currentYear + 1, userData.month - 1, userData.day);
      }
      
      const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
      
      upcomingBirthdays.push({
        userId,
        month: userData.month,
        day: userData.day,
        monthName: getMonthName(userData.month),
        date: nextBirthday,
        daysUntil
      });
    }

    // Sort by days until birthday
    upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);
    
    // Return limited results
    return upcomingBirthdays.slice(0, limit);
  } catch (error) {
    logger.error('Error in getUpcomingBirthdays service', {
      error: error.message,
      guildId,
      limit
    });
    throw error;
  }
}

/**
 * Get birthdays happening today
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @returns {Promise<Array>} Array of user IDs with birthdays today
 */
export async function getTodaysBirthdays(client, guildId) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    const today = new Date();
    const currentMonth = today.getUTCMonth() + 1;
    const currentDay = today.getUTCDate();

    const todaysBirthdays = [];

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
      error: error.message,
      guildId
    });
    throw error;
  }
}

/**
 * Check for birthdays across all guilds and send birthday messages
 * @param {Object} client - Discord client
 */
export async function checkBirthdays(client) {
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

      if (!birthdayChannelId || !birthdayRoleId) {
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Skipping birthday check for ${guild.name}: Missing channel or role config.`);
        }
        continue;
      }

      const channel = await guild.channels.fetch(birthdayChannelId).catch(() => null);
      if (!channel) continue;

      const trackingKey = `bday-role-tracking-${guildId}`;
      const trackingData = (await client.db.get(trackingKey)) || {};
      const updatedTrackingData = { ...trackingData };
      
      for (const userId of Object.keys(trackingData)) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member && member.roles.cache.has(birthdayRoleId)) {
            await member.roles.remove(birthdayRoleId, "Birthday role expired");
          }
          delete updatedTrackingData[userId];
        } catch (error) {
          console.error(`Error removing birthday role from ${userId}:`, error);
        }
      }

      if (Object.keys(updatedTrackingData).length !== Object.keys(trackingData).length) {
        await client.db.set(trackingKey, updatedTrackingData);
      }

      const birthdaysKey = `birthdays:${guildId}`;
      const birthdays = (await client.db.get(birthdaysKey)) || {};
      const birthdayMembers = [];
      for (const [userId, userData] of Object.entries(birthdays)) {
        if (userData.month === currentMonth && userData.day === currentDay) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            birthdayMembers.push(member);
            try {
              await member.roles.add(birthdayRoleId, "Happy Birthday! 🎉");
              updatedTrackingData[userId] = true;
            } catch (error) {
              console.error(`Error adding birthday role to ${member.user.tag}:`, error);
            }
          }
        }
      }

      if (birthdayMembers.length > 0) {
        await client.db.set(trackingKey, updatedTrackingData);
        const mentionList = birthdayMembers.map(m => m.toString()).join(', ');
        
        await channel.send({
          embeds: [{
            title: '🎉 Happy Birthday! 🎂',
            description: `A very happy birthday to ${mentionList}! Wishing you an amazing day! 🎈`,
            color: 0xff69b4,
            footer: { text: 'Birthday Bot' },
            timestamp: new Date()
          }]
        });
      }
    } catch (error) {
      logger.error(`Error processing birthdays for guild ${guildId}:`, error);
    }
  }
}




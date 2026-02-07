import { logger } from '../utils/logger.js';

/**
 * Update a specific counter
 * @param {Client} client - Discord client
 * @param {Guild} guild - The guild
 * @param {Object} counter - The counter to update
 * @returns {Promise<boolean>} Whether the update was successful
 */
export async function updateCounter(client, guild, counter) {
  try {
    if (!counter || !counter.type || !counter.channelId) {
      logger.warn('Skipping invalid counter in updateCounter:', counter);
      return false;
    }
    
    const { type, channelId } = counter;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      logger.error('Channel not found for counter:', channelId);
      return false;
    }

    let count;
    switch (type) {
      case "members":
        count = guild.memberCount;
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Member count for guild ${guild.id}: ${count}`);
        }
        break;
      case "bots":
        count = guild.members.cache.filter((m) => m.user.bot).size;
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Bot count for guild ${guild.id}: ${count}`);
        }
        break;
      case "members_only":
        count = guild.members.cache.filter((m) => !m.user.bot).size;
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Human count for guild ${guild.id}: ${count}`);
        }
        break;
      default:
        logger.error('Unknown counter type:', type);
        return false;
    }

    const baseName = channel.name.replace(/\s*[:]\s*\d+$/, '').trim();
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Base name: "${baseName}", Current name: "${channel.name}"`);
    }
    
    const newName = `${baseName}: ${count}`;
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`New name would be: "${newName}"`);
    }
    
    if (channel.name !== newName) {
      try {
        await channel.setName(newName);
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Updated channel name to: "${newName}"`);
        }
      } catch (error) {
        logger.error(`Failed to update channel name for ${channel.id}:`, error);
        return false;
      }
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Channel name already correct, no update needed');
      }
    }
    return true;
  } catch (error) {
    logger.error("Error updating counter:", error);
    return false;
  }
}

/**
 * Get all server counters
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Array>} The counters array
 */
export async function getServerCounters(client, guildId) {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for getServerCounters');
      return [];
    }
    
    const data = await client.db.get(`counters:${guildId}`);
    
    let counters = [];
    
    if (data && typeof data === 'object' && data.ok && Array.isArray(data.value)) {
      counters = data.value;
    } else if (Array.isArray(data)) {
      counters = data;
    } else if (data && typeof data === 'object' && !data.ok) {
      counters = Object.values(data);
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('No counter data found, returning empty array');
      }
      return [];
    }
    
    
    const validCounters = counters.filter(counter => 
      counter && 
      typeof counter === 'object' &&
      counter.type && 
      counter.channelId &&
      counter.id
    );
    
    return validCounters;
  } catch (error) {
    logger.error("Error getting server counters:", error);
    return [];
  }
}

/**
 * Save server counters
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {Array} counters - The counters array to save
 * @returns {Promise<boolean>} Whether the save was successful
 */
export async function saveServerCounters(client, guildId, counters) {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for saveServerCounters');
      return false;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Saving ${counters.length} counters for guild ${guildId}:`, counters);
    }
    await client.db.set(`counters:${guildId}`, counters);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Counters saved successfully');
    }
    return true;
  } catch (error) {
    logger.error("Error saving server counters:", error);
    return false;
  }
}

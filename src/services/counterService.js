/**
 * Update a specific counter
 * @param {Client} client - Discord client
 * @param {Guild} guild - The guild
 * @param {Object} counter - The counter to update
 * @returns {Promise<boolean>} Whether the update was successful
 */
export async function updateCounter(client, guild, counter) {
  try {
    // Skip invalid counters
    if (!counter || !counter.type || !counter.channelId) {
      console.warn('Skipping invalid counter in updateCounter:', counter);
      return false;
    }
    
    const { type, channelId } = counter;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      console.error('Channel not found for counter:', channelId);
      return false;
    }

    let count;
    switch (type) {
      case "members":
        count = guild.memberCount;
        console.log(`Member count for guild ${guild.id}: ${count}`);
        break;
      case "bots":
        count = guild.members.cache.filter((m) => m.user.bot).size;
        console.log(`Bot count for guild ${guild.id}: ${count}`);
        break;
      case "members_only":
        count = guild.members.cache.filter((m) => !m.user.bot).size;
        console.log(`Human count for guild ${guild.id}: ${count}`);
        break;
      default:
        console.error('Unknown counter type:', type);
        return false;
    }

    // Get the base name without any existing count
    const baseName = channel.name.replace(/\s*[:]\s*\d+$/, '').trim();
    console.log(`Base name: "${baseName}", Current name: "${channel.name}"`);
    
    // Create new name with count
    const newName = `${baseName}: ${count}`;
    console.log(`New name would be: "${newName}"`);
    
    // Only update if the name would change
    if (channel.name !== newName) {
      try {
        await channel.setName(newName);
        console.log(`Updated channel name to: "${newName}"`);
      } catch (error) {
        console.error(`Failed to update channel name for ${channel.id}:`, error);
        return false;
      }
    } else {
      console.log('Channel name already correct, no update needed');
    }
    return true;
  } catch (error) {
    console.error("Error updating counter:", error);
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
    const data = await client.db.get(`counters:${guildId}`);
    
    // Handle various data formats and filter out invalid entries
    let counters = [];
    
    // Check if data has the Replit database response format { ok: true, value: [...] }
    if (data && typeof data === 'object' && data.ok && Array.isArray(data.value)) {
      counters = data.value;
    } else if (Array.isArray(data)) {
      counters = data;
    } else if (data && typeof data === 'object' && !data.ok) {
      // Handle case where data is the actual counters object
      counters = Object.values(data);
    } else {
      console.log('No counter data found, returning empty array');
      return [];
    }
    
    
    // Filter out invalid entries
    const validCounters = counters.filter(counter => 
      counter && 
      typeof counter === 'object' &&
      counter.type && 
      counter.channelId &&
      counter.id
    );
    
    return validCounters;
  } catch (error) {
    console.error("Error getting server counters:", error);
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
    console.log(`Saving ${counters.length} counters for guild ${guildId}:`, counters);
    await client.db.set(`counters:${guildId}`, counters);
    console.log('Counters saved successfully');
    return true;
  } catch (error) {
    console.error("Error saving server counters:", error);
    return false;
  }
}

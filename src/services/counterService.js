/**
 * Update a specific counter
 * @param {Client} client - Discord client
 * @param {Guild} guild - The guild
 * @param {Object} counter - The counter to update
 * @returns {Promise<boolean>} Whether the update was successful
 */
export async function updateCounter(client, guild, counter) {
  try {
    const { type, channelId } = counter;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return false;

    let count;
    switch (type) {
      case "members":
        count = guild.memberCount;
        break;
      case "bots":
        count = guild.members.cache.filter((m) => m.user.bot).size;
        break;
      case "members_only":
        count = guild.members.cache.filter((m) => !m.user.bot).size;
        break;
      default:
        return false;
    }

    // Get the base name without any existing count
    const baseName = channel.name.replace(/\s*\[\d+\]\s*$/, '').trim();
    
    // Create new name with count
    const newName = `${baseName} [${count}]`;
    
    // Only update if the name would change
    if (channel.name !== newName) {
      try {
        await channel.setName(newName);
      } catch (error) {
        console.error(`Failed to update channel name for ${channel.id}:`, error);
        return false;
      }
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
 * @returns {Promise<Object>} The counters object
 */
export async function getServerCounters(client, guildId) {
  try {
    const counters = await client.db.get(`counters:${guildId}`) || {};
    return counters;
  } catch (error) {
    console.error("Error getting server counters:", error);
    return {};
  }
}

/**
 * Save server counters
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} counters - The counters to save
 * @returns {Promise<boolean>} Whether the save was successful
 */
export async function saveServerCounters(client, guildId, counters) {
  try {
    await client.db.set(`counters:${guildId}`, counters);
    return true;
  } catch (error) {
    console.error("Error saving server counters:", error);
    return false;
  }
}

/**
 * Get the reaction role message from the database
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} messageId - The message ID
 * @returns {Promise<Object|null>} The reaction role message or null if not found
 */
export async function getReactionRoleMessage(client, guildId, messageId) {
    try {
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await client.db.get(key);
        return data || null;
    } catch (error) {
        console.error(`Error getting reaction role message ${messageId} in guild ${guildId}:`, error);
        return null;
    }
}

/**
 * Add a reaction role to a message
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} messageId - The message ID
 * @param {string} emoji - The emoji ID or name
 * @param {string} roleId - The role ID
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function addReactionRole(client, guildId, messageId, emoji, roleId) {
    try {
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        // Add or update the role for this emoji
        data.roles[emoji] = roleId;
        
        await client.db.set(key, data);
        return true;
    } catch (error) {
        console.error(`Error adding reaction role in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Remove a reaction role from a message
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} messageId - The message ID
 * @param {string} emoji - The emoji ID or name
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function removeReactionRole(client, guildId, messageId, emoji) {
    try {
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data || !data.roles[emoji]) {
            return false;
        }

        // Remove the role for this emoji
        delete data.roles[emoji];

        // If there are no more roles, delete the message data
        if (Object.keys(data.roles).length === 0) {
            await client.db.delete(key);
        } else {
            await client.db.set(key, data);
        }
        
        return true;
    } catch (error) {
        console.error(`Error removing reaction role in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Get all reaction role messages for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Array>} Array of reaction role messages
 */
export async function getAllReactionRoleMessages(client, guildId) {
    try {
        const prefix = `reaction_roles:${guildId}:`;
        const keys = await client.db.list(prefix);
        
        if (!keys || keys.length === 0) {
            return [];
        }

        const messages = [];
        for (const key of keys) {
            const data = await client.db.get(key);
            if (data) {
                messages.push(data);
            }
        }

        return messages;
    } catch (error) {
        console.error(`Error getting all reaction role messages for guild ${guildId}:`, error);
        return [];
    }
}

/**
 * Set the channel ID for a reaction role message
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} messageId - The message ID
 * @param {string} channelId - The channel ID
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function setReactionRoleChannel(client, guildId, messageId, channelId) {
    try {
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.channelId = channelId;
        await client.db.set(key, data);
        return true;
    } catch (error) {
        console.error(`Error setting channel for reaction role message ${messageId}:`, error);
        return false;
    }
}

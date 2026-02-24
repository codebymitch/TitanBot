import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';




const MAX_ROLES_PER_MESSAGE = 25;




const DANGEROUS_PERMISSIONS = [
    'Administrator',
    'ManageGuild',
    'ManageRoles',
    'ManageChannels',
    'ManageWebhooks',
    'BanMembers',
    'KickMembers'
];






function validateGuildId(guildId) {
    if (!guildId || typeof guildId !== 'string' || !/^\d{17,19}$/.test(guildId)) {
        throw createError(
            `Invalid guild ID: ${guildId}`,
            ErrorTypes.VALIDATION,
            'Invalid server ID provided.',
            { guildId }
        );
    }
}






function validateMessageId(messageId) {
    if (!messageId || typeof messageId !== 'string' || !/^\d{17,19}$/.test(messageId)) {
        throw createError(
            `Invalid message ID: ${messageId}`,
            ErrorTypes.VALIDATION,
            'Invalid message ID provided.',
            { messageId }
        );
    }
}






function validateRoleId(roleId) {
    if (!roleId || typeof roleId !== 'string' || !/^\d{17,19}$/.test(roleId)) {
        throw createError(
            `Invalid role ID: ${roleId}`,
            ErrorTypes.VALIDATION,
            'Invalid role ID provided.',
            { roleId }
        );
    }
}






export function hasDangerousPermissions(role) {
    if (!role || !role.permissions) return false;
    
    for (const permission of DANGEROUS_PERMISSIONS) {
        if (role.permissions.has(permission)) {
            return true;
        }
    }
    return false;
}

async function validateRoleSafety(client, guildId, roleId) {
    const guild = client.guilds?.cache?.get(guildId) || await client.guilds?.fetch?.(guildId).catch(() => null);
    if (!guild) {
        throw createError(
            `Guild not found for role validation: ${guildId}`,
            ErrorTypes.VALIDATION,
            'Server not found while validating reaction roles.',
            { guildId, roleId }
        );
    }

    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw createError(
            `Role not found: ${roleId}`,
            ErrorTypes.VALIDATION,
            'One or more selected roles no longer exist.',
            { guildId, roleId }
        );
    }

    if (hasDangerousPermissions(role)) {
        throw createError(
            `Dangerous role permission detected: ${roleId}`,
            ErrorTypes.PERMISSION,
            'For security reasons, high-privilege roles cannot be assigned through reaction roles.',
            { guildId, roleId, roleName: role.name, dangerousPermissions: DANGEROUS_PERMISSIONS }
        );
    }

    const botHighestRole = guild.members.me?.roles?.highest;
    if (!botHighestRole || role.position >= botHighestRole.position) {
        throw createError(
            `Role above bot hierarchy: ${roleId}`,
            ErrorTypes.PERMISSION,
            'I cannot assign this role because it is equal to or above my highest role.',
            { guildId, roleId, rolePosition: role.position, botRolePosition: botHighestRole?.position }
        );
    }
}

/**
 * Get the reaction role message from the database
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} messageId - The message ID
 * @returns {Promise<Object|null>} The reaction role message or null if not found
 * @throws {TitanBotError} If validation fails or database error occurs
 */
export async function getReactionRoleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await client.db.get(key);
        return data || null;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Error getting reaction role message ${messageId} in guild ${guildId}:`, error);
        throw createError(
            `Database error retrieving reaction role message`,
            ErrorTypes.DATABASE,
            'Failed to retrieve reaction role data. Please try again.',
            { guildId, messageId, originalError: error.message }
        );
    }
}











export async function createReactionRoleMessage(client, guildId, channelId, messageId, roleIds) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!channelId || typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
            throw createError(
                `Invalid channel ID: ${channelId}`,
                ErrorTypes.VALIDATION,
                'Invalid channel ID provided.',
                { channelId }
            );
        }
        
        if (!Array.isArray(roleIds) || roleIds.length === 0) {
            throw createError(
                'No roles provided',
                ErrorTypes.VALIDATION,
                'You must provide at least one role.',
                { roleIds }
            );
        }
        
        if (roleIds.length > MAX_ROLES_PER_MESSAGE) {
            throw createError(
                `Too many roles: ${roleIds.length}`,
                ErrorTypes.VALIDATION,
                `You can only add up to ${MAX_ROLES_PER_MESSAGE} roles per reaction role message.`,
                { roleIds, limit: MAX_ROLES_PER_MESSAGE }
            );
        }
        
        
        for (const roleId of roleIds) {
            validateRoleId(roleId);
            await validateRoleSafety(client, guildId, roleId);
        }
        
        const reactionRoleData = {
            guildId,
            channelId,
            messageId,
            roles: roleIds,
            createdAt: new Date().toISOString()
        };
        
        const key = `reaction_roles:${guildId}:${messageId}`;
        await client.db.set(key, reactionRoleData);
        
        logger.info(`Created reaction role message ${messageId} in guild ${guildId} with ${roleIds.length} roles`);
        return reactionRoleData;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Error creating reaction role message in guild ${guildId}:`, error);
        throw createError(
            `Database error creating reaction role message`,
            ErrorTypes.DATABASE,
            'Failed to save reaction role data. Please try again.',
            { guildId, messageId, originalError: error.message }
        );
    }
}











export async function addReactionRole(client, guildId, messageId, emoji, roleId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        validateRoleId(roleId);
        await validateRoleSafety(client, guildId, roleId);
        
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.roles[emoji] = roleId;
        
        await client.db.set(key, data);
        logger.info(`Added reaction role for emoji ${emoji} to message ${messageId} in guild ${guildId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Error adding reaction role in guild ${guildId}:`, error);
        throw createError(
            `Database error adding reaction role`,
            ErrorTypes.DATABASE,
            'Failed to add reaction role. Please try again.',
            { guildId, messageId, originalError: error.message }
        );
    }
}









export async function deleteReactionRoleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data) {
            throw createError(
                `Reaction role message not found: ${messageId}`,
                ErrorTypes.CONFIGURATION,
                'No reaction role message found with that ID in this server.',
                { guildId, messageId }
            );
        }
        
        await client.db.delete(key);
        logger.info(`Deleted reaction role message ${messageId} in guild ${guildId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Error deleting reaction role message in guild ${guildId}:`, error);
        throw createError(
            `Database error deleting reaction role message`,
            ErrorTypes.DATABASE,
            'Failed to delete reaction role message. Please try again.',
            { guildId, messageId, originalError: error.message }
        );
    }
}










export async function removeReactionRole(client, guildId, messageId, emoji) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data || !data.roles[emoji]) {
            return false;
        }

        delete data.roles[emoji];

        if (Object.keys(data.roles).length === 0) {
            await client.db.delete(key);
            logger.info(`Removed last reaction role from message ${messageId}, deleted message data`);
        } else {
            await client.db.set(key, data);
            logger.info(`Removed reaction role for emoji ${emoji} from message ${messageId}`);
        }
        
        return true;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Error removing reaction role in guild ${guildId}:`, error);
        throw createError(
            `Database error removing reaction role`,
            ErrorTypes.DATABASE,
            'Failed to remove reaction role. Please try again.',
            { guildId, messageId, originalError: error.message }
        );
    }
}

/**
 * Get all reaction role messages for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Array>} Array of reaction role messages
 * @throws {TitanBotError} If validation fails or database error occurs
 */
export async function getAllReactionRoleMessages(client, guildId) {
    try {
        validateGuildId(guildId);
        
        const prefix = `reaction_roles:${guildId}:`;
        
        let keys;
        try {
            keys = await client.db.list(prefix);
            
            if (keys && typeof keys === 'object') {
                if (Array.isArray(keys)) {
                    
                } else if (keys.value && Array.isArray(keys.value)) {
                    keys = keys.value;
                } else {
                    const allKeys = await client.db.list();
                    
                    if (Array.isArray(allKeys)) {
                        keys = allKeys.filter(key => key.startsWith(prefix));
                    } else if (allKeys.value && Array.isArray(allKeys.value)) {
                        keys = allKeys.value.filter(key => key.startsWith(prefix));
                    } else {
                        return [];
                    }
                }
            } else {
                return [];
            }
        } catch (listError) {
            logger.error(`Error listing reaction role keys for guild ${guildId}:`, listError);
            throw createError(
                'Database error listing reaction roles',
                ErrorTypes.DATABASE,
                'Failed to retrieve reaction role list. Please try again.',
                { guildId, originalError: listError.message }
            );
        }
        
        if (!keys || keys.length === 0) {
            return [];
        }

        const messages = [];
        
        for (const key of keys) {
            try {
                const data = await client.db.get(key);
                
                if (data) {
                    let actualData;
                    if (data && data.ok && data.value) {
                        actualData = data.value;
                    } else if (data && data.value) {
                        actualData = data.value;
                    } else {
                        actualData = data;
                    }
                    
                    if (actualData) {
                        messages.push(actualData);
                    }
                }
            } catch (dataError) {
                logger.warn(`Error getting data for reaction role key ${key}:`, dataError);
                
            }
        }

        logger.debug(`Retrieved ${messages.length} reaction role messages for guild ${guildId}`);
        return messages;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Error getting all reaction role messages for guild ${guildId}:`, error);
        throw createError(
            'Database error retrieving reaction roles',
            ErrorTypes.DATABASE,
            'Failed to retrieve reaction role messages. Please try again.',
            { guildId, originalError: error.message }
        );
    }
}










export async function setReactionRoleChannel(client, guildId, messageId, channelId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!channelId || typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
            throw createError(
                `Invalid channel ID: ${channelId}`,
                ErrorTypes.VALIDATION,
                'Invalid channel ID provided.',
                { channelId }
            );
        }
        
        const key = `reaction_roles:${guildId}:${messageId}`;
        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.channelId = channelId;
        await client.db.set(key, data);
        logger.info(`Set channel ${channelId} for reaction role message ${messageId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }
        logger.error(`Error setting channel for reaction role message ${messageId}:`, error);
        throw createError(
            `Database error setting reaction role channel`,
            ErrorTypes.DATABASE,
            'Failed to update reaction role channel. Please try again.',
            { guildId, messageId, channelId, originalError: error.message }
        );
    }
}

/**
 * Reconcile reaction role messages against Discord state and remove stale database entries.
 * Useful on startup to clean records for messages/channels deleted while the bot was offline.
 * @param {Object} client - The Discord client
 * @param {string} [guildId] - Optional guild ID to reconcile. If omitted, reconciles all guilds.
 * @returns {Promise<Object>} Cleanup summary
 */
export async function reconcileReactionRoleMessages(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        scannedMessages: 0,
        removedMessages: 0,
        errors: 0
    };

    try {
        const targetGuildIds = guildId
            ? [guildId]
            : Array.from(client.guilds.cache.keys());

        for (const targetGuildId of targetGuildIds) {
            summary.scannedGuilds += 1;

            let reactionRoleMessages = [];
            try {
                reactionRoleMessages = await getAllReactionRoleMessages(client, targetGuildId);
            } catch (error) {
                summary.errors += 1;
                logger.warn(`Failed to fetch reaction role messages for reconciliation in guild ${targetGuildId}:`, error);
                continue;
            }

            if (!reactionRoleMessages.length) {
                continue;
            }

            const guild = client.guilds.cache.get(targetGuildId) || await client.guilds.fetch(targetGuildId).catch(() => null);
            if (!guild) {
                for (const reactionRoleMessage of reactionRoleMessages) {
                    summary.scannedMessages += 1;
                    await client.db.delete(`reaction_roles:${targetGuildId}:${reactionRoleMessage.messageId}`);
                    summary.removedMessages += 1;
                }
                logger.info(`Removed ${reactionRoleMessages.length} stale reaction role message(s) for unavailable guild ${targetGuildId}`);
                continue;
            }

            for (const reactionRoleMessage of reactionRoleMessages) {
                summary.scannedMessages += 1;

                try {
                    const channel = guild.channels.cache.get(reactionRoleMessage.channelId)
                        || await guild.channels.fetch(reactionRoleMessage.channelId).catch(() => null);

                    if (!channel || !channel.isTextBased?.()) {
                        await client.db.delete(`reaction_roles:${targetGuildId}:${reactionRoleMessage.messageId}`);
                        summary.removedMessages += 1;
                        continue;
                    }

                    const message = await channel.messages.fetch(reactionRoleMessage.messageId).catch(() => null);
                    if (!message) {
                        await client.db.delete(`reaction_roles:${targetGuildId}:${reactionRoleMessage.messageId}`);
                        summary.removedMessages += 1;
                    }
                } catch (messageCheckError) {
                    summary.errors += 1;
                    logger.warn(
                        `Failed to validate reaction role message ${reactionRoleMessage.messageId} during reconciliation:`,
                        messageCheckError
                    );
                }
            }
        }

        logger.info(
            `Reaction role reconciliation complete: scanned ${summary.scannedMessages} message(s) across ${summary.scannedGuilds} guild(s), removed ${summary.removedMessages}, errors ${summary.errors}`
        );

        return summary;
    } catch (error) {
        logger.error('Unexpected error during reaction role reconciliation:', error);
        summary.errors += 1;
        return summary;
    }
}



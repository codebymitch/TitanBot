/**
 * Join to Create Service Layer
 * Centralized business logic for the Join to Create feature
 * Handles all JoinToCreate operations with proper error handling, validation, and logging
 */

import {
    getJoinToCreateConfig,
    saveJoinToCreateConfig,
    updateJoinToCreateConfig,
    getTemporaryChannelInfo,
    formatChannelName as formatChannelNameUtil
} from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

/**
 * Validate channel name template for security
 * @param {string} template - The template to validate
 * @throws {TitanBotError} If validation fails
 * @returns {boolean} True if valid
 */
export function validateChannelNameTemplate(template) {
    if (!template || typeof template !== 'string') {
        throw new TitanBotError(
            'Invalid channel template: must be a non-empty string',
            ErrorTypes.VALIDATION,
            'Channel name template must be valid text.'
        );
    }

    if (template.length > 100) {
        throw new TitanBotError(
            'Channel template exceeds maximum length',
            ErrorTypes.VALIDATION,
            'Channel name template cannot exceed 100 characters.'
        );
    }

    // Allow only alphanumeric, spaces, hyphens, and template variables
    const validPattern = /^[\w\s\-\{\}]*$/;
    if (!validPattern.test(template)) {
        throw new TitanBotError(
            'Channel template contains invalid characters',
            ErrorTypes.VALIDATION,
            'Channel template can only contain letters, numbers, spaces, hyphens, and template variables like {username}.'
        );
    }

    return true;
}

/**
 * Validate bitrate value
 * @param {number} bitrate - The bitrate in kbps
 * @throws {TitanBotError} If validation fails
 * @returns {boolean} True if valid
 */
export function validateBitrate(bitrate) {
    const bitrateNum = parseInt(bitrate);

    if (isNaN(bitrateNum)) {
        throw new TitanBotError(
            'Bitrate must be a valid number',
            ErrorTypes.VALIDATION,
            'Please enter a valid number for bitrate.'
        );
    }

    if (bitrateNum < 8 || bitrateNum > 384) {
        throw new TitanBotError(
            'Bitrate out of valid range',
            ErrorTypes.VALIDATION,
            'Bitrate must be between 8 and 384 kbps.'
        );
    }

    return true;
}

/**
 * Validate user limit value
 * @param {number} limit - The user limit
 * @throws {TitanBotError} If validation fails
 * @returns {boolean} True if valid
 */
export function validateUserLimit(limit) {
    const limitNum = parseInt(limit);

    if (isNaN(limitNum)) {
        throw new TitanBotError(
            'User limit must be a valid number',
            ErrorTypes.VALIDATION,
            'Please enter a valid number for user limit.'
        );
    }

    if (limitNum < 0 || limitNum > 99) {
        throw new TitanBotError(
            'User limit out of valid range',
            ErrorTypes.VALIDATION,
            'User limit must be between 0 (no limit) and 99.'
        );
    }

    return true;
}

/**
 * Format channel name with template variables (security-hardened version)
 * @param {string} template - The name template
 * @param {Object} variables - Variables to replace
 * @returns {string} The formatted channel name
 * @throws {TitanBotError} If formatting fails
 */
export function formatChannelName(template, variables) {
    try {
        validateChannelNameTemplate(template);

        if (!variables || typeof variables !== 'object') {
            throw new TitanBotError(
                'Invalid variables object for channel formatting',
                ErrorTypes.VALIDATION
            );
        }

        // Sanitize all input variables
        const sanitized = {};
        for (const [key, value] of Object.entries(variables)) {
            if (value === null || value === undefined) {
                sanitized[key] = 'Unknown';
            } else {
                // Remove any potentially dangerous characters
                sanitized[key] = String(value)
                    .replace(/[^\w\s-]/g, '')
                    .trim()
                    .substring(0, 32); // Limit individual variable length
            }
        }

        const replacements = {
            '{username}': sanitized.username || 'User',
            '{user_tag}': sanitized.userTag || 'User#0000',
            '{displayName}': sanitized.displayName || 'User',
            '{display_name}': sanitized.displayName || 'User',
            '{guildName}': sanitized.guildName || 'Server',
            '{guild_name}': sanitized.guildName || 'Server',
            '{channelName}': sanitized.channelName || 'Voice Channel',
            '{channel_name}': sanitized.channelName || 'Voice Channel',
        };

        let formatted = template;
        for (const [placeholder, value] of Object.entries(replacements)) {
            formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }

        // Final sanitization - remove any remaining special characters
        formatted = formatted.replace(/[^\w\s-]/g, '').trim();

        // Ensure channel name is between 1 and 100 characters
        if (formatted.length === 0) {
            formatted = 'Voice Channel';
        } else if (formatted.length > 100) {
            formatted = formatted.substring(0, 100);
        }

        logger.debug(`Formatted channel name: "${formatted}" from template "${template}"`);
        return formatted;

    } catch (error) {
        logger.error('Error formatting channel name:', error);
        throw error;
    }
}

/**
 * Initialize Join to Create system for a guild
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Trigger channel ID
 * @param {Object} options - Configuration options
 * @throws {TitanBotError} If initialization fails
 */
export async function initializeJoinToCreate(client, guildId, channelId, options = {}) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Database service not available',
                ErrorTypes.DATABASE,
                'System error occurred. Please try again.'
            );
        }

        if (!guildId || !channelId) {
            throw new TitanBotError(
                'Missing required guild or channel ID',
                ErrorTypes.VALIDATION,
                'Invalid guild or channel information provided.'
            );
        }

        // Validate all options
        if (options.nameTemplate) {
            validateChannelNameTemplate(options.nameTemplate);
        }
        if (options.bitrate) {
            validateBitrate(options.bitrate / 1000); // Convert from stored format
        }
        if (options.userLimit !== undefined) {
            validateUserLimit(options.userLimit);
        }

        const config = await getJoinToCreateConfig(client, guildId);

        if (config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Channel already configured as Join to Create trigger',
                ErrorTypes.VALIDATION,
                'This channel is already set up as a Join to Create trigger.'
            );
        }

        config.triggerChannels.push(channelId);
        config.enabled = true;

        if (Object.keys(options).length > 0) {
            if (!config.channelOptions) {
                config.channelOptions = {};
            }
            config.channelOptions[channelId] = {
                nameTemplate: options.nameTemplate || config.channelNameTemplate,
                userLimit: options.userLimit !== undefined ? options.userLimit : config.userLimit,
                bitrate: options.bitrate || config.bitrate,
                categoryId: options.categoryId || null,
                createdAt: Date.now()
            };
        }

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(`Initialized Join to Create for guild ${guildId} with trigger channel ${channelId}`);

        return config;

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to initialize Join to Create: ${error.message}`,
            ErrorTypes.DATABASE,
            'Failed to set up Join to Create system.'
        );
    }
}

/**
 * Update Join to Create configuration for a guild
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Trigger channel ID
 * @param {Object} updates - Configuration updates
 * @throws {TitanBotError} If update fails
 */
export async function updateChannelConfig(client, guildId, channelId, updates) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Database service not available',
                ErrorTypes.DATABASE
            );
        }

        const config = await getJoinToCreateConfig(client, guildId);

        if (!config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Channel is not configured as a Join to Create trigger',
                ErrorTypes.VALIDATION,
                'This channel is not set up as a Join to Create trigger.'
            );
        }

        // Validate updates
        if (updates.nameTemplate) {
            validateChannelNameTemplate(updates.nameTemplate);
        }
        if (updates.bitrate !== undefined) {
            validateBitrate(updates.bitrate / 1000);
        }
        if (updates.userLimit !== undefined) {
            validateUserLimit(updates.userLimit);
        }

        if (!config.channelOptions) {
            config.channelOptions = {};
        }

        config.channelOptions[channelId] = {
            ...config.channelOptions[channelId],
            ...updates,
            updatedAt: Date.now()
        };

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(`Updated Join to Create config for channel ${channelId} in guild ${guildId}`, {
            updates: Object.keys(updates)
        });

        return config.channelOptions[channelId];

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to update channel config: ${error.message}`,
            ErrorTypes.DATABASE,
            'Failed to update configuration.'
        );
    }
}

/**
 * Remove a trigger channel from Join to Create system
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Trigger channel ID
 * @throws {TitanBotError} If removal fails
 */
export async function removeTriggerChannel(client, guildId, channelId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Database service not available',
                ErrorTypes.DATABASE
            );
        }

        const config = await getJoinToCreateConfig(client, guildId);

        const index = config.triggerChannels.indexOf(channelId);
        if (index === -1) {
            throw new TitanBotError(
                'Channel not found in Join to Create triggers',
                ErrorTypes.VALIDATION,
                'This channel is not configured as a Join to Create trigger.'
            );
        }

        config.triggerChannels.splice(index, 1);
        config.enabled = config.triggerChannels.length > 0;

        if (config.channelOptions && config.channelOptions[channelId]) {
            delete config.channelOptions[channelId];
        }

        // Clean up any temporary channels created from this trigger
        if (config.temporaryChannels) {
            for (const [tempChannelId, tempInfo] of Object.entries(config.temporaryChannels)) {
                if (tempInfo.triggerChannelId === channelId) {
                    delete config.temporaryChannels[tempChannelId];
                }
            }
        }

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(`Removed Join to Create trigger channel ${channelId} from guild ${guildId}`);

        return true;

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to remove trigger channel: ${error.message}`,
            ErrorTypes.DATABASE,
            'Failed to remove trigger channel.'
        );
    }
}

/**
 * Get current Join to Create configuration for a guild
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @returns {Object} Configuration object
 * @throws {TitanBotError} If retrieval fails
 */
export async function getConfiguration(client, guildId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Database service not available',
                ErrorTypes.DATABASE
            );
        }

        return await getJoinToCreateConfig(client, guildId);

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to retrieve configuration: ${error.message}`,
            ErrorTypes.DATABASE,
            'Failed to retrieve settings.'
        );
    }
}

/**
 * Check if a channel is a valid Join to Create trigger
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID to check
 * @returns {boolean} Whether channel is a trigger
 */
export async function isTriggerChannel(client, guildId, channelId) {
    try {
        const config = await getConfiguration(client, guildId);
        return config.triggerChannels.includes(channelId);
    } catch (error) {
        logger.error(`Error checking if channel is trigger: ${error.message}`);
        return false;
    }
}

/**
 * Get configuration for a specific trigger channel
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Trigger channel ID
 * @returns {Object} Channel-specific configuration
 * @throws {TitanBotError} If channel not found
 */
export async function getChannelConfiguration(client, guildId, channelId) {
    try {
        const config = await getConfiguration(client, guildId);

        if (!config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Channel is not a valid Join to Create trigger',
                ErrorTypes.VALIDATION,
                'This channel is not set up as a Join to Create trigger.'
            );
        }

        return {
            ...config,
            channelConfig: config.channelOptions?.[channelId] || {}
        };

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to get channel configuration: ${error.message}`,
            ErrorTypes.DATABASE
        );
    }
}

/**
 * Check if user has ManageGuild permission (helper)
 * @param {Object} member - Guild member
 * @returns {boolean} Whether member has permission
 */
export function hasManageGuildPermission(member) {
    try {
        if (!member || !member.permissions) {
            return false;
        }
        return member.permissions.has(PermissionFlagsBits.ManageGuild);
    } catch (error) {
        logger.error('Error checking ManageGuild permission:', error);
        return false;
    }
}

/**
 * Log Join to Create configuration change
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User who made the change
 * @param {string} action - Action performed
 * @param {Object} details - Change details
 */
export async function logConfigurationChange(client, guildId, userId, action, details) {
    try {
        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.CONFIGURATION_CHANGE,
            data: {
                description: `Join to Create: ${action}`,
                userId,
                action,
                details,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.warn(`Failed to log Join to Create configuration change: ${error.message}`);
    }
}

/**
 * Create temporary voice channel with validation
 * @param {Object} guild - Discord guild
 * @param {Object} member - Guild member
 * @param {Object} options - Channel creation options
 * @returns {Object} Created channel info
 * @throws {TitanBotError} If creation fails
 */
export async function createTemporaryChannel(guild, member, options = {}) {
    try {
        if (!guild || !member) {
            throw new TitanBotError(
                'Invalid guild or member',
                ErrorTypes.VALIDATION
            );
        }

        const {
            nameTemplate,
            userLimit,
            bitrate,
            parentId
        } = options;

        // Validate options
        if (nameTemplate) {
            validateChannelNameTemplate(nameTemplate);
        }
        if (userLimit !== undefined) {
            validateUserLimit(userLimit);
        }
        if (bitrate !== undefined) {
            validateBitrate(bitrate / 1000);
        }

        // Format channel name
        const channelName = formatChannelName(nameTemplate || '{username}\'s Room', {
            username: member.user.username,
            displayName: member.displayName,
            userTag: member.user.tag,
            guildName: guild.name
        });

        // Create channel
        const tempChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentId,
            userLimit: userLimit === 0 ? undefined : userLimit,
            bitrate: bitrate || 64000,
            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.MoveMembers]
                },
                {
                    id: guild.id,
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                }
            ]
        });

        logger.info(`Created temporary voice channel ${tempChannel.name} (${tempChannel.id}) for user ${member.user.tag}`);

        return {
            id: tempChannel.id,
            name: tempChannel.name,
            ownerId: member.id
        };

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Failed to create temporary channel: ${error.message}`,
            ErrorTypes.DISCORD_API,
            'Failed to create your temporary voice channel. Please contact an administrator.'
        );
    }
}

export default {
    validateChannelNameTemplate,
    validateBitrate,
    validateUserLimit,
    formatChannelName,
    initializeJoinToCreate,
    updateChannelConfig,
    removeTriggerChannel,
    getConfiguration,
    isTriggerChannel,
    getChannelConfiguration,
    hasManageGuildPermission,
    logConfigurationChange,
    createTemporaryChannel
};

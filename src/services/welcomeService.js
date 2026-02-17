/**
 * WELCOME SERVICE
 * 
 * Centralized business logic for welcome/goodbye system operations
 * Handles message templates, auto-role assignment, and audit logging
 * 
 * Features:
 * - Template validation and message variable parsing
 * - Auto-role assignment with conflict detection
 * - Welcome/goodbye message preview and sending
 * - Rate limiting for bulk role operations
 * - Comprehensive audit trail
 * - Permission verification
 * 
 * Usage:
 * import WelcomeService from '../../services/welcomeService.js';
 * const result = await WelcomeService.setupWelcome(client, guildId, config);
 */

import { logger } from '../utils/logger.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';

// Rate limiting for auto-role updates
const autoRoleUpdateLimits = new Map();
const AUTOROLE_UPDATE_COOLDOWN = 5 * 60 * 1000; // 5 minutes between bulk updates

class WelcomeService {
    
    // ========== CONSTANTS ==========
    static VALID_MESSAGE_TOKENS = [
        '{user}',
        '{user.mention}',
        '{user.tag}',
        '{user.username}',
        '{user.discriminator}',
        '{user.id}',
        '{username}',
        '{server}',
        '{server.name}',
        '{guild.name}',
        '{guild.id}',
        '{guild.memberCount}',
        '{memberCount}',
        '{membercount}'
    ];
    
    static MAX_MESSAGE_LENGTH = 2000;
    static MAX_ROLES_PER_GUILD = 50;

    /**
     * Validate a welcome message template
     * @param {string} message - Message template to validate
     * @returns {Promise<Object>} Validation result
     */
    static async validateMessageTemplate(message) {
        logger.debug(`[WELCOME_SERVICE] Validating message template`, { messageLength: message?.length });

        if (!message || typeof message !== 'string') {
            throw createError(
                'Invalid message',
                ErrorTypes.VALIDATION,
                'Message must be a non-empty string.',
                { provided: typeof message }
            );
        }

        const trimmed = message.trim();
        if (trimmed.length === 0) {
            throw createError(
                'Empty message',
                ErrorTypes.VALIDATION,
                'Welcome message cannot be empty.',
                { length: trimmed.length }
            );
        }

        if (trimmed.length > this.MAX_MESSAGE_LENGTH) {
            throw createError(
                'Message too long',
                ErrorTypes.VALIDATION,
                `Welcome message cannot exceed **${this.MAX_MESSAGE_LENGTH}** characters. Current: **${trimmed.length}**`,
                { length: trimmed.length, max: this.MAX_MESSAGE_LENGTH }
            );
        }

        return {
            isValid: true,
            length: trimmed.length,
            hasPing: trimmed.includes('{user}') || trimmed.includes('{user.mention}')
        };
    }

    /**
     * Validate image URL
     * @param {string} url - URL to validate
     * @returns {Promise<boolean>}
     */
    static async validateImageUrl(url) {
        if (!url) return true; // Image is optional

        try {
            const urlObject = new URL(url);
            if (!['http:', 'https:'].includes(urlObject.protocol)) {
                throw new Error('Invalid protocol');
            }
            return true;
        } catch (error) {
            logger.warn(`[WELCOME_SERVICE] Invalid image URL provided: ${url}`);
            throw createError(
                'Invalid image URL',
                ErrorTypes.VALIDATION,
                'Image URL must start with `http://` or `https://`',
                { url }
            );
        }
    }

    /**
     * Parse and validate message variables
     * @param {string} message - Message template
     * @returns {Object} Parsed tokens and counts
     */
    static parseMessageVariables(message) {
        logger.debug(`[WELCOME_SERVICE] Parsing message variables`);

        const tokens = [];
        const usedTokens = new Set();

        for (const token of this.VALID_MESSAGE_TOKENS) {
            if (message.includes(token)) {
                usedTokens.add(token);
            }
        }

        return {
            usedTokens: Array.from(usedTokens),
            count: usedTokens.size,
            hasMemberInfo: usedTokens.has('{guild.memberCount}') || usedTokens.has('{memberCount}'),
            hasUserInfo: usedTokens.some(t => t.includes('{user') || t.includes('{username}'))
        };
    }

    /**
     * Setup welcome system
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {Object} config - Configuration object
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} Setup result
     */
    static async setupWelcome(client, guildId, config, adminId) {
        logger.info(`[WELCOME_SERVICE] Setting up welcome system`, {
            guildId,
            adminId,
            channelId: config.channelId
        });

        // Validate message
        await this.validateMessageTemplate(config.message);
        
        // Validate image URL if provided
        if (config.image) {
            await this.validateImageUrl(config.image);
        }

        // Parse variables
        const variables = this.parseMessageVariables(config.message);

        // Check channel exists
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(config.channelId);
        if (!channel || !channel.isTextBased?.()) {
            throw createError(
                'Invalid channel',
                ErrorTypes.VALIDATION,
                'The specified channel does not exist or is not a text channel.',
                { channelId: config.channelId, guildId }
            );
        }

        // Update config
        await updateWelcomeConfig(client, guildId, {
            enabled: true,
            channelId: config.channelId,
            welcomeMessage: config.message,
            welcomeImage: config.image || undefined,
            welcomePing: config.ping ?? false,
            setupBy: adminId,
            setupAt: new Date().toISOString()
        });

        logger.info(`[WELCOME_SERVICE] Welcome system setup completed`, {
            guildId,
            adminId,
            variables: variables.usedTokens,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            variables: variables.usedTokens,
            variableCount: variables.count,
            channelId: config.channelId,
            messageLength: config.message.length
        };
    }

    /**
     * Setup goodbye system
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {Object} config - Configuration object
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} Setup result
     */
    static async setupGoodbye(client, guildId, config, adminId) {
        logger.info(`[WELCOME_SERVICE] Setting up goodbye system`, {
            guildId,
            adminId,
            channelId: config.channelId
        });

        // Validate message
        await this.validateMessageTemplate(config.message);
        
        // Validate image URL if provided
        if (config.image) {
            await this.validateImageUrl(config.image);
        }

        // Parse variables
        const variables = this.parseMessageVariables(config.message);

        // Check channel exists
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(config.channelId);
        if (!channel || !channel.isTextBased?.()) {
            throw createError(
                'Invalid channel',
                ErrorTypes.VALIDATION,
                'The specified channel does not exist or is not a text channel.',
                { channelId: config.channelId, guildId }
            );
        }

        // Update config
        await updateWelcomeConfig(client, guildId, {
            goodbyeEnabled: true,
            goodbyeChannelId: config.channelId,
            leaveMessage: config.message,
            leaveImage: config.image || undefined,
            goodbyeSetupBy: adminId,
            goodbyeSetupAt: new Date().toISOString()
        });

        logger.info(`[WELCOME_SERVICE] Goodbye system setup completed`, {
            guildId,
            adminId,
            variables: variables.usedTokens,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            variables: variables.usedTokens,
            variableCount: variables.count,
            channelId: config.channelId,
            messageLength: config.message.length
        };
    }

    /**
     * Toggle welcome system
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} New state
     */
    static async toggleWelcome(client, guildId, adminId) {
        logger.info(`[WELCOME_SERVICE] Toggling welcome system`, { guildId, adminId });

        const config = await getWelcomeConfig(client, guildId);
        const newState = !config.enabled;

        await updateWelcomeConfig(client, guildId, {
            enabled: newState,
            lastToggledBy: adminId,
            lastToggled: new Date().toISOString()
        });

        logger.info(`[WELCOME_SERVICE] Welcome toggled to ${newState}`, {
            guildId,
            adminId,
            newState,
            timestamp: new Date().toISOString()
        });

        return { enabled: newState, guildId };
    }

    /**
     * Toggle goodbye system
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} New state
     */
    static async toggleGoodbye(client, guildId, adminId) {
        logger.info(`[WELCOME_SERVICE] Toggling goodbye system`, { guildId, adminId });

        const config = await getWelcomeConfig(client, guildId);
        const newState = !config.goodbyeEnabled;

        await updateWelcomeConfig(client, guildId, {
            goodbyeEnabled: newState,
            lastGoodbyeToggleBy: adminId,
            lastGoodbyeToggle: new Date().toISOString()
        });

        logger.info(`[WELCOME_SERVICE] Goodbye toggled to ${newState}`, {
            guildId,
            adminId,
            newState,
            timestamp: new Date().toISOString()
        });

        return { enabled: newState, guildId };
    }

    /**
     * Add role to auto-assignment with validation
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string} roleId - Role ID to add
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} Updated roles list
     */
    static async addAutoRole(client, guildId, roleId, adminId) {
        logger.info(`[WELCOME_SERVICE] Adding auto-role`, { guildId, roleId, adminId });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        const role = guild.roles.cache.get(roleId);
        if (!role) {
            throw createError(
                'Role not found',
                ErrorTypes.VALIDATION,
                'The specified role does not exist.',
                { roleId, guildId }
            );
        }

        // Check if bot can assign the role
        const botHighestRole = guild.members.me?.roles.highest;
        if (role.position >= botHighestRole?.position) {
            logger.warn(`[WELCOME_SERVICE] Cannot add role higher than bot's highest role`, {
                guildId,
                roleId,
                rolePosition: role.position,
                botPosition: botHighestRole?.position
            });
            throw createError(
                'Role too high',
                ErrorTypes.VALIDATION,
                "I can't assign roles that are higher than my highest role.",
                { roleId, rolePosition: role.position }
            );
        }

        const config = await getWelcomeConfig(client, guildId);
        const existingRoles = config.roleIds || [];

        // Check for duplicates
        if (existingRoles.includes(roleId)) {
            logger.info(`[WELCOME_SERVICE] Role already in auto-assign list`, {
                guildId,
                roleId
            });
            throw createError(
                'Duplicate role',
                ErrorTypes.VALIDATION,
                'This role is already set to be auto-assigned.',
                { roleId }
            );
        }

        // Check max roles limit
        if (existingRoles.length >= this.MAX_ROLES_PER_GUILD) {
            logger.warn(`[WELCOME_SERVICE] Max auto-roles exceeded`, {
                guildId,
                count: existingRoles.length,
                max: this.MAX_ROLES_PER_GUILD
            });
            throw createError(
                'Too many roles',
                ErrorTypes.VALIDATION,
                `You can only auto-assign up to **${this.MAX_ROLES_PER_GUILD}** roles.`,
                { current: existingRoles.length, max: this.MAX_ROLES_PER_GUILD }
            );
        }

        // Add role (maintain uniqueness)
        const updatedRoles = [...new Set([...existingRoles, roleId])];

        await updateWelcomeConfig(client, guildId, {
            roleIds: updatedRoles,
            autoRoleUpdatedBy: adminId,
            autoRoleUpdatedAt: new Date().toISOString()
        });

        logger.info(`[WELCOME_SERVICE] Auto-role added successfully`, {
            guildId,
            roleId,
            roleName: role.name,
            adminId,
            totalRoles: updatedRoles.length,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            roleId,
            roleName: role.name,
            totalAutoRoles: updatedRoles.length
        };
    }

    /**
     * Remove role from auto-assignment
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string} roleId - Role ID to remove
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} Updated roles list
     */
    static async removeAutoRole(client, guildId, roleId, adminId) {
        logger.info(`[WELCOME_SERVICE] Removing auto-role`, { guildId, roleId, adminId });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        const config = await getWelcomeConfig(client, guildId);
        const existingRoles = config.roleIds || [];

        if (!existingRoles.includes(roleId)) {
            logger.info(`[WELCOME_SERVICE] Role not in auto-assign list`, {
                guildId,
                roleId
            });
            throw createError(
                'Role not found',
                ErrorTypes.VALIDATION,
                'This role is not set to be auto-assigned.',
                { roleId }
            );
        }

        const updatedRoles = existingRoles.filter(id => id !== roleId);
        const role = guild.roles.cache.get(roleId);

        await updateWelcomeConfig(client, guildId, {
            roleIds: updatedRoles,
            autoRoleUpdatedBy: adminId,
            autoRoleUpdatedAt: new Date().toISOString()
        });

        logger.info(`[WELCOME_SERVICE] Auto-role removed successfully`, {
            guildId,
            roleId,
            roleName: role?.name || 'Unknown',
            adminId,
            totalRoles: updatedRoles.length,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            roleId,
            totalAutoRoles: updatedRoles.length
        };
    }

    /**
     * Get and validate all auto-roles for a guild
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Valid and invalid roles
     */
    static async getAutoRoles(client, guildId) {
        logger.debug(`[WELCOME_SERVICE] Fetching auto-roles`, { guildId });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        const config = await getWelcomeConfig(client, guildId);
        const autoRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

        const validRoles = [];
        const invalidRoleIds = [];

        const roles = await guild.roles.fetch();

        for (const roleId of autoRoles) {
            const role = roles.get(roleId);
            if (role) {
                validRoles.push({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    mentionable: role.mentionable
                });
            } else {
                invalidRoleIds.push(roleId);
            }
        }

        // Clean up invalid roles
        if (invalidRoleIds.length > 0) {
            logger.warn(`[WELCOME_SERVICE] Found invalid auto-roles, cleaning up`, {
                guildId,
                invalidCount: invalidRoleIds.length
            });

            const updatedRoles = validRoles.map(r => r.id);
            await updateWelcomeConfig(client, guildId, {
                roleIds: updatedRoles
            });
        }

        return {
            validRoles,
            validCount: validRoles.length,
            invalidCount: invalidRoleIds.length,
            wasCleaned: invalidRoleIds.length > 0
        };
    }

    /**
     * Preview welcome message with actual user/guild data
     * @param {Client} client - Discord client
     * @param {string} messageTemplate - Message template
     * @param {Object} data - User and guild data
     * @returns {string} Formatted message
     */
    static previewWelcomeMessage(messageTemplate, data) {
        logger.debug(`[WELCOME_SERVICE] Generating message preview`);

        try {
            return formatWelcomeMessage(messageTemplate, data);
        } catch (error) {
            logger.error(`[WELCOME_SERVICE] Error formatting preview message`, error);
            throw createError(
                'Preview failed',
                ErrorTypes.DATABASE,
                'Could not generate message preview. Please check your message format.',
                { error: error.message }
            );
        }
    }

    /**
     * Bulk update auto-role assignments with rate limiting
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string[]} roleIds - Array of role IDs
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} Update result
     */
    static async bulkUpdateAutoRoles(client, guildId, roleIds, adminId) {
        logger.info(`[WELCOME_SERVICE] Bulk updating auto-roles`, {
            guildId,
            roleCount: roleIds.length,
            adminId
        });

        // Check rate limit
        const key = `${guildId}:autorole`;
        const lastUpdate = autoRoleUpdateLimits.get(key);
        const now = Date.now();

        if (lastUpdate && (now - lastUpdate) < this.AUTOROLE_UPDATE_COOLDOWN) {
            const remaining = this.AUTOROLE_UPDATE_COOLDOWN - (now - lastUpdate);
            logger.warn(`[WELCOME_SERVICE] Auto-role update rate limited`, {
                guildId,
                timeRemaining: remaining
            });
            throw createError(
                'Rate limited',
                ErrorTypes.RATE_LIMIT,
                `Bulk updates are limited to once every **5 minutes**. Wait **${Math.ceil(remaining / 1000)}** seconds.`,
                { remaining, guildId }
            );
        }

        // Validate all roles before update
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        const botHighestRole = guild.members.me?.roles.highest;
        const roles = await guild.roles.fetch();

        const validRoles = [];
        for (const roleId of roleIds) {
            const role = roles.get(roleId);
            if (role && role.position < botHighestRole?.position) {
                validRoles.push(roleId);
            }
        }

        // Update config
        await updateWelcomeConfig(client, guildId, {
            roleIds: validRoles,
            autoRoleUpdatedBy: adminId,
            autoRoleUpdatedAt: new Date().toISOString()
        });

        // Set rate limit
        autoRoleUpdateLimits.set(key, now);

        logger.info(`[WELCOME_SERVICE] Bulk auto-role update completed`, {
            guildId,
            adminId,
            requestedCount: roleIds.length,
            validCount: validRoles.length,
            skippedCount: roleIds.length - validRoles.length,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            validCount: validRoles.length,
            skippedCount: roleIds.length - validRoles.length,
            totalAutoRoles: validRoles.length
        };
    }
}

export default WelcomeService;

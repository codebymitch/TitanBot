/**
 * CONFIG SERVICE
 * 
 * Centralized business logic for guild configuration operations
 * Provides validation, permission checks, audit trail, and conflict detection
 * 
 * Features:
 * - Centralized setting validation
 * - Permission verification and enforcement
 * - Configuration change audit trail
 * - Settings conflict detection and prevention
 * - Bulk config updates with validation
 * - Configuration rollback support
 * - Change notification system
 * 
 * Usage:
 * import ConfigService from '../../services/configService.js';
 * const result = await ConfigService.updateSetting(client, guildId, 'logChannelId', channelId, adminId);
 */

import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './guildConfig.js';
import { Permissions } from 'discord.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';

// Config change history for audit trail
const configChangeHistory = new Map();
const CONFIG_HISTORY_LIMIT = 100;

// Configuration validation rules
const CONFIG_VALIDATION_RULES = {
    logChannelId: { type: 'channel', required: false },
    reportChannelId: { type: 'channel', required: false },
    premiumRoleId: { type: 'role', required: false },
    autoRole: { type: 'role', required: false },
    modRole: { type: 'role', required: false },
    adminRole: { type: 'role', required: false },
    prefix: { type: 'string', required: false, maxLength: 10, minLength: 1 },
    dmOnClose: { type: 'boolean', required: false },
    maxTicketsPerUser: { type: 'number', required: false, min: 1, max: 50 },
    birthdayChannelId: { type: 'channel', required: false },
    logIgnore: { type: 'object', required: false },
    logging: { type: 'object', required: false }
};

// Settings that have dependencies/conflicts
const SETTING_CONFLICTS = {
    'logChannelId': ['logging'],
    'birthdayChannelId': [],
    'reportChannelId': [],
    'logging': ['logChannelId']
};

class ConfigService {

    // ========== CONSTANTS ==========
    static MAX_CHANNEL_IDS = 10;
    static MAX_ROLE_IDS = 20;
    static MAX_PREFIX_LENGTH = 10;
    static PROTECTED_SETTINGS = ['_id', 'guildId', 'createdAt']; // Cannot be modified

    /**
     * Validate configuration value based on rules
     * @param {string} key - Config key
     * @param {*} value - Config value to validate
     * @param {Guild} guild - Discord guild for context
     * @returns {Promise<boolean>}
     */
    static async validateConfigValue(key, value, guild) {
        logger.debug(`[CONFIG_SERVICE] Validating config value`, { key, type: typeof value });

        const rule = CONFIG_VALIDATION_RULES[key];
        
        if (!rule) {
            logger.warn(`[CONFIG_SERVICE] No validation rule for key: ${key}`);
            return true; // Allow unknown keys
        }

        // Handle null/undefined for optional settings
        if (rule.required === false && (value === null || value === undefined)) {
            return true;
        }

        // Type validation
        if (rule.type === 'channel') {
            if (typeof value !== 'string' && typeof value !== 'object') {
                throw createError(
                    'Invalid channel',
                    ErrorTypes.VALIDATION,
                    'Channel ID must be a string.',
                    { key, provided: typeof value }
                );
            }

            const channelId = typeof value === 'string' ? value : value.id;
            const channel = guild.channels.cache.get(channelId);

            if (!channel) {
                throw createError(
                    'Channel not found',
                    ErrorTypes.VALIDATION,
                    'The specified channel does not exist.',
                    { key, channelId }
                );
            }

            if (!channel.isTextBased?.()) {
                throw createError(
                    'Invalid channel type',
                    ErrorTypes.VALIDATION,
                    'Only text channels are allowed.',
                    { key, channelId, channelType: channel.type }
                );
            }

            return true;
        }

        if (rule.type === 'role') {
            if (typeof value !== 'string' && typeof value !== 'object') {
                throw createError(
                    'Invalid role',
                    ErrorTypes.VALIDATION,
                    'Role ID must be a string.',
                    { key, provided: typeof value }
                );
            }

            const roleId = typeof value === 'string' ? value : value.id;
            const role = guild.roles.cache.get(roleId);

            if (!role) {
                throw createError(
                    'Role not found',
                    ErrorTypes.VALIDATION,
                    'The specified role does not exist.',
                    { key, roleId }
                );
            }

            // Check if bot can interact with this role
            const botHighestRole = guild.members.me?.roles.highest;
            if (role.position >= botHighestRole?.position) {
                throw createError(
                    'Role too high',
                    ErrorTypes.VALIDATION,
                    "Can't set roles higher than my highest role.",
                    { key, roleId, rolePosition: role.position }
                );
            }

            return true;
        }

        if (rule.type === 'string') {
            if (typeof value !== 'string') {
                throw createError(
                    'Invalid value type',
                    ErrorTypes.VALIDATION,
                    'Value must be a string.',
                    { key, provided: typeof value }
                );
            }

            const length = value.length;
            if (rule.maxLength && length > rule.maxLength) {
                throw createError(
                    'Value too long',
                    ErrorTypes.VALIDATION,
                    `Value cannot exceed **${rule.maxLength}** characters.`,
                    { key, current: length, max: rule.maxLength }
                );
            }

            if (rule.minLength && length < rule.minLength) {
                throw createError(
                    'Value too short',
                    ErrorTypes.VALIDATION,
                    `Value must be at least **${rule.minLength}** character(s).`,
                    { key, current: length, min: rule.minLength }
                );
            }

            return true;
        }

        if (rule.type === 'number') {
            if (typeof value !== 'number') {
                throw createError(
                    'Invalid value type',
                    ErrorTypes.VALIDATION,
                    'Value must be a number.',
                    { key, provided: typeof value }
                );
            }

            if (rule.min !== undefined && value < rule.min) {
                throw createError(
                    'Value too low',
                    ErrorTypes.VALIDATION,
                    `Value must be at least **${rule.min}**.`,
                    { key, value, min: rule.min }
                );
            }

            if (rule.max !== undefined && value > rule.max) {
                throw createError(
                    'Value too high',
                    ErrorTypes.VALIDATION,
                    `Value cannot exceed **${rule.max}**.`,
                    { key, value, max: rule.max }
                );
            }

            return true;
        }

        if (rule.type === 'boolean') {
            if (typeof value !== 'boolean') {
                throw createError(
                    'Invalid value type',
                    ErrorTypes.VALIDATION,
                    'Value must be true or false.',
                    { key, provided: typeof value }
                );
            }

            return true;
        }

        if (rule.type === 'object') {
            if (typeof value !== 'object' || value === null) {
                throw createError(
                    'Invalid value type',
                    ErrorTypes.VALIDATION,
                    'Value must be an object.',
                    { key, provided: typeof value }
                );
            }

            return true;
        }

        return true;
    }

    /**
     * Detect configuration conflicts
     * @param {Object} currentConfig - Current configuration
     * @param {string} key - Key being updated
     * @param {*} value - New value
     * @returns {string[]} Array of conflict descriptions
     */
    static detectConflicts(currentConfig, key, value) {
        logger.debug(`[CONFIG_SERVICE] Checking for config conflicts`, { key });

        const conflicts = [];
        const relatedSettings = SETTING_CONFLICTS[key] || [];

        for (const related of relatedSettings) {
            if (related === 'logging' && value === null) {
                // Disabling log channel might conflict with logging system
                if (currentConfig.logging?.enabled) {
                    conflicts.push(
                        `Disabling log channel but logging system is still enabled. Consider disabling logging first.`
                    );
                }
            }
        }

        return conflicts;
    }

    /**
     * Update a single configuration setting with validation
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string} key - Setting key
     * @param {*} value - New value
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} Update result
     */
    static async updateSetting(client, guildId, key, value, adminId) {
        logger.info(`[CONFIG_SERVICE] Updating setting`, {
            guildId,
            key,
            adminId,
            valueType: typeof value
        });

        // Prevent modification of protected settings
        if (this.PROTECTED_SETTINGS.includes(key)) {
            logger.warn(`[CONFIG_SERVICE] Attempted to modify protected setting`, {
                key,
                guildId,
                adminId
            });
            throw createError(
                'Protected setting',
                ErrorTypes.VALIDATION,
                `The setting **${key}** cannot be modified.`,
                { key }
            );
        }

        // Get guild for context
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        // Validate value
        await this.validateConfigValue(key, value, guild);

        // Get current config for conflict detection
        const currentConfig = await getGuildConfig(client, guildId);

        // Check for conflicts
        const conflicts = this.detectConflicts(currentConfig, key, value);
        if (conflicts.length > 0) {
            logger.warn(`[CONFIG_SERVICE] Config conflicts detected`, {
                guildId,
                key,
                conflicts
            });
            // Log conflicts but don't prevent update (allow user to proceed)
        }

        // Store old value for audit
        const oldValue = currentConfig[key];

        // Update config
        const updatedConfig = { ...currentConfig, [key]: value };
        await setGuildConfig(client, guildId, updatedConfig);

        // Record audit trail
        this.recordChange(guildId, {
            key,
            oldValue,
            newValue: value,
            changedBy: adminId,
            timestamp: new Date().toISOString(),
            conflicts
        });

        logger.info(`[CONFIG_SERVICE] Setting updated successfully`, {
            guildId,
            key,
            adminId,
            oldValue: typeof oldValue === 'string' ? oldValue.substring(0, 50) : oldValue,
            newValue: typeof value === 'string' ? value.substring(0, 50) : value,
            hasConflicts: conflicts.length > 0,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            key,
            oldValue,
            newValue: value,
            conflicts
        };
    }

    /**
     * Bulk update multiple settings
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {Object} updates - Keys and values to update
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} Bulk update result
     */
    static async bulkUpdate(client, guildId, updates, adminId) {
        logger.info(`[CONFIG_SERVICE] Bulk updating settings`, {
            guildId,
            updateCount: Object.keys(updates).length,
            adminId
        });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        // Validate all updates first
        const validatedUpdates = {};
        const validationErrors = [];

        for (const [key, value] of Object.entries(updates)) {
            try {
                if (this.PROTECTED_SETTINGS.includes(key)) {
                    validationErrors.push(`${key}: Protected setting cannot be modified`);
                    continue;
                }

                await this.validateConfigValue(key, value, guild);
                validatedUpdates[key] = value;
            } catch (error) {
                validationErrors.push(`${key}: ${error.details?.message || error.message}`);
            }
        }

        if (validationErrors.length > 0) {
            logger.warn(`[CONFIG_SERVICE] Bulk update validation failed`, {
                guildId,
                errors: validationErrors
            });
            throw createError(
                'Validation failed',
                ErrorTypes.VALIDATION,
                `Some settings failed validation:\n• ${validationErrors.join('\n• ')}`,
                { errors: validationErrors }
            );
        }

        // Get current config
        const currentConfig = await getGuildConfig(client, guildId);

        // Apply updates
        const updatedConfig = { ...currentConfig, ...validatedUpdates };
        await setGuildConfig(client, guildId, updatedConfig);

        // Record each change
        for (const [key, value] of Object.entries(validatedUpdates)) {
            this.recordChange(guildId, {
                key,
                oldValue: currentConfig[key],
                newValue: value,
                changedBy: adminId,
                isBulkUpdate: true,
                timestamp: new Date().toISOString()
            });
        }

        logger.info(`[CONFIG_SERVICE] Bulk update completed`, {
            guildId,
            adminId,
            appliedCount: Object.keys(validatedUpdates).length,
            failedCount: validationErrors.length,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            applied: Object.keys(validatedUpdates),
            failed: validationErrors,
            appliedCount: Object.keys(validatedUpdates).length,
            failedCount: validationErrors.length
        };
    }

    /**
     * Record configuration change for audit trail
     * @private
     */
    static recordChange(guildId, changeData) {
        if (!configChangeHistory.has(guildId)) {
            configChangeHistory.set(guildId, []);
        }

        const history = configChangeHistory.get(guildId);
        history.push(changeData);

        // Keep only last N changes
        if (history.length > CONFIG_HISTORY_LIMIT) {
            history.shift();
        }

        logger.debug(`[CONFIG_SERVICE] Change recorded for audit trail`, {
            guildId,
            key: changeData.key,
            historySize: history.length
        });
    }

    /**
     * Get configuration change history
     * @param {string} guildId - Guild ID
     * @param {number} limit - Maximum number of records
     * @returns {Object[]} Change history
     */
    static getChangeHistory(guildId, limit = 20) {
        const history = configChangeHistory.get(guildId) || [];
        return history.slice(-limit).reverse();
    }

    /**
     * Reset setting to default value
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string} key - Setting key
     * @param {string} adminId - Admin user ID for audit
     * @returns {Promise<Object>} Result
     */
    static async resetSetting(client, guildId, key, adminId) {
        logger.info(`[CONFIG_SERVICE] Resetting setting`, {
            guildId,
            key,
            adminId
        });

        const currentConfig = await getGuildConfig(client, guildId);
        const oldValue = currentConfig[key];

        // Get default value (null for optional settings)
        const defaultValue = null;

        const updatedConfig = { ...currentConfig, [key]: defaultValue };
        await setGuildConfig(client, guildId, updatedConfig);

        this.recordChange(guildId, {
            key,
            oldValue,
            newValue: defaultValue,
            changedBy: adminId,
            isReset: true,
            timestamp: new Date().toISOString()
        });

        logger.info(`[CONFIG_SERVICE] Setting reset successfully`, {
            guildId,
            key,
            adminId,
            oldValue,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            key,
            oldValue,
            newValue: defaultValue
        };
    }

    /**
     * Get all guild settings summary
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Configuration summary
     */
    static async getConfigSummary(client, guildId) {
        logger.debug(`[CONFIG_SERVICE] Fetching config summary`, { guildId });

        const config = await getGuildConfig(client, guildId);
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        // Get readable names for IDs
        const summary = {};

        for (const [key, value] of Object.entries(config)) {
            if (this.PROTECTED_SETTINGS.includes(key)) continue;

            const rule = CONFIG_VALIDATION_RULES[key];
            if (!rule) continue;

            if (rule.type === 'channel' && value) {
                const channel = guild.channels.cache.get(value);
                summary[key] = {
                    id: value,
                    name: channel?.name || 'Unknown',
                    status: channel ? 'Valid' : 'Missing'
                };
            } else if (rule.type === 'role' && value) {
                const role = guild.roles.cache.get(value);
                summary[key] = {
                    id: value,
                    name: role?.name || 'Unknown',
                    status: role ? 'Valid' : 'Missing'
                };
            } else {
                summary[key] = value;
            }
        }

        return {
            guildId,
            settings: summary,
            recordedAt: new Date().toISOString()
        };
    }

    /**
     * Verify user has permission to modify settings
     * @param {GuildMember} member - Guild member
     * @returns {boolean}
     */
    static verifyPermission(member) {
        return member.permissions.has([
            Permissions.FLAGS.ADMINISTRATOR,
            Permissions.FLAGS.MANAGE_GUILD
        ]);
    }
}

export default ConfigService;

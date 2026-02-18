



















import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './guildConfig.js';
import { PermissionFlagsBits } from 'discord.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';


const configChangeHistory = new Map();
const CONFIG_HISTORY_LIMIT = 100;


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


const SETTING_CONFLICTS = {
    'logChannelId': ['logging'],
    'birthdayChannelId': [],
    'reportChannelId': [],
    'logging': ['logChannelId']
};

class ConfigService {

    
    static MAX_CHANNEL_IDS = 10;
    static MAX_ROLE_IDS = 20;
    static MAX_PREFIX_LENGTH = 10;
    static PROTECTED_SETTINGS = ['_id', 'guildId', 'createdAt']; 
    static UNSAFE_KEYS = ['__proto__', 'prototype', 'constructor'];

    static validateConfigKeySafety(key) {
        if (typeof key !== 'string' || key.trim().length === 0) {
            throw createError(
                'Invalid setting key',
                ErrorTypes.VALIDATION,
                'Setting key must be a non-empty string.',
                { key }
            );
        }

        if (this.UNSAFE_KEYS.includes(key)) {
            throw createError(
                'Unsafe setting key',
                ErrorTypes.VALIDATION,
                'This setting key is not allowed for security reasons.',
                { key }
            );
        }
    }

    






    static async validateConfigValue(key, value, guild) {
        logger.debug(`[CONFIG_SERVICE] Validating config value`, { key, type: typeof value });

        const rule = CONFIG_VALIDATION_RULES[key];
        
        if (!rule) {
            logger.warn(`[CONFIG_SERVICE] No validation rule for key: ${key}`);
            return true; 
        }

        
        if (rule.required === false && (value === null || value === undefined)) {
            return true;
        }

        
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

    






    static detectConflicts(currentConfig, key, value) {
        logger.debug(`[CONFIG_SERVICE] Checking for config conflicts`, { key });

        const conflicts = [];
        const relatedSettings = SETTING_CONFLICTS[key] || [];

        for (const related of relatedSettings) {
            if (related === 'logging' && value === null) {
                
                if (currentConfig.logging?.enabled) {
                    conflicts.push(
                        `Disabling log channel but logging system is still enabled. Consider disabling logging first.`
                    );
                }
            }
        }

        return conflicts;
    }

    








    static async updateSetting(client, guildId, key, value, adminId) {
        logger.info(`[CONFIG_SERVICE] Updating setting`, {
            guildId,
            key,
            adminId,
            valueType: typeof value
        });

        
        this.validateConfigKeySafety(key);

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

        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        
        await this.validateConfigValue(key, value, guild);

        
        const currentConfig = await getGuildConfig(client, guildId);

        
        const conflicts = this.detectConflicts(currentConfig, key, value);
        if (conflicts.length > 0) {
            logger.warn(`[CONFIG_SERVICE] Config conflicts detected`, {
                guildId,
                key,
                conflicts
            });
            
        }

        
        const oldValue = currentConfig[key];

        
        const updatedConfig = { ...currentConfig, [key]: value };
        await setGuildConfig(client, guildId, updatedConfig);

        
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

        
        const validatedUpdates = {};
        const validationErrors = [];

        for (const [key, value] of Object.entries(updates)) {
            try {
                this.validateConfigKeySafety(key);

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

        
        const currentConfig = await getGuildConfig(client, guildId);

        
        const updatedConfig = { ...currentConfig, ...validatedUpdates };
        await setGuildConfig(client, guildId, updatedConfig);

        
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

    



    static recordChange(guildId, changeData) {
        if (!configChangeHistory.has(guildId)) {
            configChangeHistory.set(guildId, []);
        }

        const history = configChangeHistory.get(guildId);
        history.push(changeData);

        
        if (history.length > CONFIG_HISTORY_LIMIT) {
            history.shift();
        }

        logger.debug(`[CONFIG_SERVICE] Change recorded for audit trail`, {
            guildId,
            key: changeData.key,
            historySize: history.length
        });
    }

    





    static getChangeHistory(guildId, limit = 20) {
        const history = configChangeHistory.get(guildId) || [];
        return history.slice(-limit).reverse();
    }

    







    static async resetSetting(client, guildId, key, adminId) {
        logger.info(`[CONFIG_SERVICE] Resetting setting`, {
            guildId,
            key,
            adminId
        });

        const currentConfig = await getGuildConfig(client, guildId);
        const oldValue = currentConfig[key];

        
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

    




    static verifyPermission(member) {
        return member.permissions.has([
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild
        ]);
    }
}

export default ConfigService;

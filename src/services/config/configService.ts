// configService.js

import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './guildConfig.js';
import { PermissionFlagsBits } from 'discord.js';
import type { Guild, GuildMember } from 'discord.js';
import { createError, ErrorTypes } from '../../utils/errorHandler.js';
import { wrapServiceClassMethods } from '../../utils/serviceErrorBoundary.js';
import { z } from 'zod';
import { LogIgnoreSchema, LoggingConfigSchema } from '../../utils/schemas.js';
import type { ErrorLike } from '../../utils/errorHandler.js';
import type { NexoClient } from '../../types/index.js';

interface ConfigValidationRule {
    type: 'channel' | 'role' | 'string' | 'boolean' | 'number' | 'object';
    required: boolean;
    maxLength?: number;
    minLength?: number;
    min?: number;
    max?: number;
}

/** Loose view of a stored guild config for the legacy logging-key migration. */
type ConfigRecord = {
    logging?: { channels?: Record<string, unknown>; enabled?: boolean; [key: string]: unknown };
    [key: string]: unknown;
};

export interface ConfigChangeRecord {
    key: string;
    oldValue: unknown;
    newValue: unknown;
    changedBy: string;
    timestamp: string;
    conflicts?: string[];
    isBulkUpdate?: boolean;
    isReset?: boolean;
}

const configChangeHistory = new Map<string, ConfigChangeRecord[]>();
const CONFIG_HISTORY_LIMIT = 100;

const CONFIG_VALIDATION_RULES: Record<string, ConfigValidationRule> = {
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

const SETTING_CONFLICTS: Record<string, string[]> = {
    'birthdayChannelId': [],
    'logging': [],
};

const LEGACY_LOGGING_KEY_MAP: Record<string, string> = {
    logChannelId: 'audit',
    reportChannelId: 'reports',
};

const ConfigValueSchemas: Readonly<Record<string, z.ZodType<unknown>>> = Object.freeze({
    logChannelId: z.union([z.string().min(1), z.object({ id: z.string().min(1) }), z.null()]),
    reportChannelId: z.union([z.string().min(1), z.object({ id: z.string().min(1) }), z.null()]),
    premiumRoleId: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    autoRole: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    modRole: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    adminRole: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    prefix: z.string().min(1).max(10),
    dmOnClose: z.boolean(),
    maxTicketsPerUser: z.number().int().min(1).max(50),
    birthdayChannelId: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    logIgnore: LogIgnoreSchema,
    logging: LoggingConfigSchema,
});

class ConfigService {

    static MAX_CHANNEL_IDS = 10;
    static MAX_ROLE_IDS = 20;
    static MAX_PREFIX_LENGTH = 10;
    static PROTECTED_SETTINGS: string[] = ['_id', 'guildId', 'createdAt']; 
    static UNSAFE_KEYS: string[] = ['__proto__', 'prototype', 'constructor'];

    static applyLoggingLegacyKey(config: ConfigRecord, key: string, value: unknown, previousConfig: ConfigRecord = {}): ConfigRecord {
        if (key === 'logIgnore') {
            const logging = {
                ...(previousConfig.logging || config.logging || {}),
                ignore: value,
            };
            const next: ConfigRecord = { ...config, logging };
            delete next.logIgnore;
            return next;
        }

        const destination = LEGACY_LOGGING_KEY_MAP[key];
        if (!destination) {
            return config;
        }

        const channelId = value && typeof value === 'object' ? (value as { id?: unknown }).id : value;
        const logging = {
            ...(previousConfig.logging || config.logging || {}),
            channels: {
                ...((previousConfig.logging || config.logging || {}).channels || {}),
                [destination]: channelId ?? null,
            },
            enabled: channelId ? true : (previousConfig.logging?.enabled ?? config.logging?.enabled ?? false),
        };

        const next: ConfigRecord = { ...config, logging };
        delete next[key];
        if (key === 'logChannelId') {
            delete next.enableLogging;
        }
        if (key === 'reportChannelId') {
            delete next.reportChannelId;
        }
        return next;
    }

    static validateConfigKeySafety(key: string): void {
        if (typeof key !== 'string' || key.trim().length === 0) {
            throw createError(
                'Invalid setting key',
                ErrorTypes.VALIDATION,
                'Der Einstellungsschlüssel darf nicht leer sein.',
                { key }
            );
        }

        if (this.UNSAFE_KEYS.includes(key)) {
            throw createError(
                'Unsafe setting key',
                ErrorTypes.VALIDATION,
                'Dieser Einstellungsschlüssel ist aus Sicherheitsgründen nicht erlaubt.',
                { key }
            );
        }
    }

    static async validateConfigValue(key: string, value: unknown, guild: Guild): Promise<boolean> {
        logger.debug(`[CONFIG_SERVICE] Validating config value`, { key, type: typeof value });

        const rule = CONFIG_VALIDATION_RULES[key];
        
        if (!rule) {
            logger.warn(`[CONFIG_SERVICE] No validation rule for key: ${key}`);
            return true; 
        }

        if (rule.required === false && (value === null || value === undefined)) {
            return true;
        }

        const zodSchema = ConfigValueSchemas[key];
        if (zodSchema) {
            const parsed = zodSchema.safeParse(value);
            if (!parsed.success) {
                throw createError(
                    'Invalid configuration value',
                    ErrorTypes.VALIDATION,
                    'Der angegebene Konfigurationswert ist ungültig.',
                    {
                        key,
                        errorCode: 'VALIDATION_FAILED',
                        issues: parsed.error.issues.map((issue) => ({
                            path: issue.path.join('.'),
                            message: issue.message,
                            code: issue.code
                        }))
                    }
                );
            }
        }

        if (rule.type === 'channel') {
            if (typeof value !== 'string' && typeof value !== 'object') {
                throw createError(
                    'Invalid channel',
                    ErrorTypes.VALIDATION,
                    'Die Kanal-ID muss ein Text sein.',
                    { key, provided: typeof value }
                );
            }

            const channelId = typeof value === 'string' ? value : (value as { id: string }).id;
            const channel = guild.channels.cache.get(channelId);

            if (!channel) {
                throw createError(
                    'Channel not found',
                    ErrorTypes.VALIDATION,
                    'Der angegebene Kanal existiert nicht.',
                    { key, channelId }
                );
            }

            if (!channel.isTextBased?.()) {
                throw createError(
                    'Invalid channel type',
                    ErrorTypes.VALIDATION,
                    'Nur Textkanäle sind erlaubt.',
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
                    'Die Rollen-ID muss ein Text sein.',
                    { key, provided: typeof value }
                );
            }

            const roleId = typeof value === 'string' ? value : (value as { id: string }).id;
            const role = guild.roles.cache.get(roleId);

            if (!role) {
                throw createError(
                    'Role not found',
                    ErrorTypes.VALIDATION,
                    'Die angegebene Rolle existiert nicht.',
                    { key, roleId }
                );
            }

            const botHighestRole = guild.members.me?.roles.highest;
            if (botHighestRole !== undefined && role.position >= botHighestRole.position) {
                throw createError(
                    'Role too high',
                    ErrorTypes.VALIDATION,
                    'Ich kann keine Rollen setzen, die höher als meine höchste Rolle sind.',
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
                    'Der Wert muss ein Text sein.',
                    { key, provided: typeof value }
                );
            }

            const length = value.length;
            if (rule.maxLength && length > rule.maxLength) {
                throw createError(
                    'Value too long',
                    ErrorTypes.VALIDATION,
                    `Der Wert darf höchstens **${rule.maxLength}** Zeichen lang sein.`,
                    { key, current: length, max: rule.maxLength }
                );
            }

            if (rule.minLength && length < rule.minLength) {
                throw createError(
                    'Value too short',
                    ErrorTypes.VALIDATION,
                    `Der Wert muss mindestens **${rule.minLength}** Zeichen lang sein.`,
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
                    'Der Wert muss eine Zahl sein.',
                    { key, provided: typeof value }
                );
            }

            if (rule.min !== undefined && value < rule.min) {
                throw createError(
                    'Value too low',
                    ErrorTypes.VALIDATION,
                    `Der Wert muss mindestens **${rule.min}** sein.`,
                    { key, value, min: rule.min }
                );
            }

            if (rule.max !== undefined && value > rule.max) {
                throw createError(
                    'Value too high',
                    ErrorTypes.VALIDATION,
                    `Der Wert darf höchstens **${rule.max}** sein.`,
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
                    'Der Wert muss true oder false sein.',
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
                    'Der Wert muss ein Objekt sein.',
                    { key, provided: typeof value }
                );
            }

            return true;
        }

        return true;
    }

    static detectConflicts(currentConfig: ConfigRecord, key: string, value: unknown): string[] {
        logger.debug(`[CONFIG_SERVICE] Checking for config conflicts`, { key });

        const conflicts: string[] = [];
        const relatedSettings = SETTING_CONFLICTS[key] || [];

        for (const related of relatedSettings) {
            if (related === 'logging' && value === null) {
                
                if (currentConfig.logging?.enabled) {
                    conflicts.push(
                        `Der Log-Kanal wird deaktiviert, das Logging ist aber noch aktiviert. Deaktiviere am besten zuerst das Logging.`
                    );
                }
            }
        }

        return conflicts;
    }

    static async updateSetting(client: NexoClient, guildId: string, key: string, value: unknown, adminId: string) {
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
                `Die Einstellung **${key}** kann nicht geändert werden.`,
                { key }
            );
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Der Server existiert nicht.',
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

        let updatedConfig: ConfigRecord = { ...currentConfig, [key]: value };
        updatedConfig = this.applyLoggingLegacyKey(updatedConfig, key, value, currentConfig);

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
            key,
            oldValue,
            newValue: value,
            conflicts
        };
    }

    static async bulkUpdate(client: NexoClient, guildId: string, updates: Record<string, unknown>, adminId: string) {
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
                'Der Server existiert nicht.',
                { guildId }
            );
        }

        const validatedUpdates: Record<string, unknown> = {};
        const validationErrors: string[] = [];

        for (const [key, value] of Object.entries(updates)) {
            try {
                this.validateConfigKeySafety(key);

                if (this.PROTECTED_SETTINGS.includes(key)) {
                    validationErrors.push(`${key}: Geschützte Einstellung kann nicht geändert werden`);
                    continue;
                }

                await this.validateConfigValue(key, value, guild);
                validatedUpdates[key] = value;
            } catch (error) {
                const err = error as ErrorLike & { details?: { message?: string } };
                validationErrors.push(`${key}: ${err.details?.message || err.message}`);
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
                `Einige Einstellungen sind ungültig:\n• ${validationErrors.join('\n• ')}`,
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
            applied: Object.keys(validatedUpdates),
            failed: validationErrors,
            appliedCount: Object.keys(validatedUpdates).length,
            failedCount: validationErrors.length
        };
    }

    static recordChange(guildId: string, changeData: ConfigChangeRecord): void {
        if (!configChangeHistory.has(guildId)) {
            configChangeHistory.set(guildId, []);
        }

        const history = configChangeHistory.get(guildId)!;
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

    static getChangeHistory(guildId: string, limit = 20): ConfigChangeRecord[] {
        const history = configChangeHistory.get(guildId) || [];
        return history.slice(-limit).reverse();
    }

    static async resetSetting(client: NexoClient, guildId: string, key: string, adminId: string) {
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
            key,
            oldValue,
            newValue: defaultValue
        };
    }

    static async getConfigSummary(client: NexoClient, guildId: string) {
        logger.debug(`[CONFIG_SERVICE] Fetching config summary`, { guildId });

        const config = await getGuildConfig(client, guildId);
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            throw createError(
                'Guild not found',
                ErrorTypes.VALIDATION,
                'Der Server existiert nicht.',
                { guildId }
            );
        }

        const summary: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(config)) {
            if (this.PROTECTED_SETTINGS.includes(key)) continue;

            const rule = CONFIG_VALIDATION_RULES[key];
            if (!rule) continue;

            if (rule.type === 'channel' && value) {
                const channel = guild.channels.cache.get(value as string);
                summary[key] = {
                    id: value,
                    name: channel?.name || 'Unbekannt',
                    status: channel ? 'Valid' : 'Missing'
                };
            } else if (rule.type === 'role' && value) {
                const role = guild.roles.cache.get(value as string);
                summary[key] = {
                    id: value,
                    name: role?.name || 'Unbekannt',
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

    static verifyPermission(member: GuildMember): boolean {
        return member.permissions.has([
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild
        ]);
    }
}

wrapServiceClassMethods(ConfigService, (methodName) => ({
    service: 'ConfigService',
    operation: methodName,
    message: `Configuration service operation failed: ${methodName}`,
    userMessage: 'Ein Konfigurationsvorgang ist fehlgeschlagen. Bitte versuch es gleich noch mal.'
}));

export default ConfigService;



















import { logger } from '../utils/logger.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';


const autoRoleUpdateLimits = new Map();
const AUTOROLE_UPDATE_COOLDOWN = 5 * 60 * 1000; 

class WelcomeService {
    
    
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

    static PRIVATE_IPV4_PATTERN = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/;

    static isPrivateOrLocalHost(hostname) {
        const host = String(hostname || '').toLowerCase();
        if (!host) return true;

        if (host === 'localhost' || host === '::1') return true;
        if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return true;
        if (this.PRIVATE_IPV4_PATTERN.test(host)) return true;

        return false;
    }

    




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

    




    static async validateImageUrl(url) {
        if (!url) return true; 

        try {
            const urlObject = new URL(url);
            if (!['http:', 'https:'].includes(urlObject.protocol)) {
                throw new Error('Invalid protocol');
            }

            if (urlObject.username || urlObject.password) {
                throw new Error('Credentials in URL are not allowed');
            }

            if (this.isPrivateOrLocalHost(urlObject.hostname)) {
                throw new Error('Private or local network hosts are not allowed');
            }

            const hasImageExtension = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(urlObject.pathname);
            if (!hasImageExtension) {
                throw new Error('URL must point to an image file');
            }

            return true;
        } catch (error) {
            logger.warn(`[WELCOME_SERVICE] Invalid image URL provided: ${url}`);
            throw createError(
                'Invalid image URL',
                ErrorTypes.VALIDATION,
                'Image URL must be a public http(s) image link and cannot point to local/private hosts.',
                { url }
            );
        }
    }

    




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

    







    static async setupWelcome(client, guildId, config, adminId) {
        logger.info(`[WELCOME_SERVICE] Setting up welcome system`, {
            guildId,
            adminId,
            channelId: config.channelId
        });

        
        await this.validateMessageTemplate(config.message);
        
        
        if (config.image) {
            await this.validateImageUrl(config.image);
        }

        
        const variables = this.parseMessageVariables(config.message);

        
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(config.channelId);
        if (!channel || !channel.isTextBased?.()) {
            throw createError(
                'Invalid channel',
                ErrorTypes.VALIDATION,
                'The specified channel does not exist or is not a text channel.',
                { channelId: config.channelId, guildId }
            );
        }

        
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

    







    static async setupGoodbye(client, guildId, config, adminId) {
        logger.info(`[WELCOME_SERVICE] Setting up goodbye system`, {
            guildId,
            adminId,
            channelId: config.channelId
        });

        
        await this.validateMessageTemplate(config.message);
        
        
        if (config.image) {
            await this.validateImageUrl(config.image);
        }

        
        const variables = this.parseMessageVariables(config.message);

        
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(config.channelId);
        if (!channel || !channel.isTextBased?.()) {
            throw createError(
                'Invalid channel',
                ErrorTypes.VALIDATION,
                'The specified channel does not exist or is not a text channel.',
                { channelId: config.channelId, guildId }
            );
        }

        
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

    







    static async bulkUpdateAutoRoles(client, guildId, roleIds, adminId) {
        logger.info(`[WELCOME_SERVICE] Bulk updating auto-roles`, {
            guildId,
            roleCount: roleIds.length,
            adminId
        });

        
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

        
        await updateWelcomeConfig(client, guildId, {
            roleIds: validRoles,
            autoRoleUpdatedBy: adminId,
            autoRoleUpdatedAt: new Date().toISOString()
        });

        
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

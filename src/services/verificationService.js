/**
 * Verification Service - Centralized verification business logic
 * 
 * This service handles all verification operations including:
 * - User verification and role assignment
 * - Auto-verification on join
 * - Verification removal and cleanup
 * - Validation and permission checks
 * - Rate limiting and cooldown tracking
 * - Audit logging
 * 
 * @module verificationService
 */

import { PermissionFlagsBits } from 'discord.js';
import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './guildConfig.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { insertVerificationAudit } from '../utils/database.js';

// Rate limiting store
const verificationCooldowns = new Map();
const attemptTracker = new Map();

const verificationDefaults = botConfig?.verification || {};
const autoVerifyDefaults = verificationDefaults.autoVerify || {};
const defaultCooldownMs = verificationDefaults.verificationCooldown ?? 5000;
const defaultMaxAttempts = verificationDefaults.maxVerificationAttempts ?? 3;
const defaultAttemptWindowMs = verificationDefaults.attemptWindow ?? 60000;
const shouldSendAutoVerifyDm = autoVerifyDefaults.sendDMNotification ?? true;
const shouldLogVerifications = verificationDefaults.logAllVerifications ?? true;
const shouldKeepAuditTrail = verificationDefaults.keepAuditTrail ?? false;

/**
 * Verify a user by assigning the verified role
 * 
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID to verify
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Result object with status and details
 * 
 * @throws {TitanBotError} If verification fails
 * 
 * @example
 * await verifyUser(client, guildId, userId, { 
 *     source: 'button_click',
 *     moderatorId: null 
 * });
 */
export async function verifyUser(client, guildId, userId, options = {}) {
    const { source = 'manual', moderatorId = null } = options;
    
    try {
        // Get guild and member
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                `Guild ${guildId} not found`,
                ErrorTypes.CONFIGURATION,
                "Guild not found in bot cache.",
                { guildId }
            );
        }

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (error) {
            throw createError(
                `Member ${userId} not found in guild`,
                ErrorTypes.USER_INPUT,
                "User is not in this server.",
                { userId, guildId }
            );
        }

        // Get verification config
        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw createError(
                "Verification system disabled",
                ErrorTypes.CONFIGURATION,
                "The verification system is not enabled on this server.",
                { guildId }
            );
        }

        // Validate setup
        await validateVerificationSetup(guild, guildConfig.verification);

        // Check if already verified
        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        if (member.roles.cache.has(verifiedRole.id)) {
            return {
                success: false,
                alreadyVerified: true,
                message: "User already verified",
                userId,
                roleId: verifiedRole.id
            };
        }

        // Check cooldown and attempt limits
        await checkVerificationCooldown(userId, guildId, defaultCooldownMs);
        await trackVerificationAttempt(userId, guildId, defaultMaxAttempts, defaultAttemptWindowMs);

        // Assign role
        await member.roles.add(verifiedRole.id, `User verified (${source})`);

        // Log successful verification
        logVerificationAction(client, guildId, userId, 'verified', {
            source,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            moderatorId
        });

        logger.info('User verified successfully', {
            guildId,
            userId,
            roleId: verifiedRole.id,
            source,
            moderatorId
        });

        return {
            success: true,
            userId,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            message: "User verified successfully"
        };

    } catch (error) {
        logger.error('Error verifying user', {
            guildId,
            userId,
            source: options.source,
            error: error.message
        });
        throw error;
    }
}

/**
 * Auto-verify a user based on criteria when they join
 * 
 * @param {Object} client - Discord client
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {import('discord.js').GuildMember} member - Guild member
 * @param {Object} verificationConfig - Verification configuration
 * @returns {Promise<Object>} Result object with auto-verify details
 * 
 * @throws {TitanBotError} If critical error occurs
 */
export async function autoVerifyOnJoin(client, guild, member, verificationConfig) {
    try {
        // Check if auto-verify is enabled
        if (!verificationConfig.autoVerify?.enabled) {
            return {
                autoVerified: false,
                reason: 'auto_verify_disabled'
            };
        }

        // Validate setup
        await validateVerificationSetup(guild, verificationConfig);

        // Determine if user meets criteria
        const shouldVerify = evaluateAutoVerifyCriteria(
            member,
            verificationConfig.autoVerify
        );

        if (!shouldVerify) {
            return {
                autoVerified: false,
                reason: 'criteria_not_met',
                criteria: verificationConfig.autoVerify.criteria
            };
        }

        // Get verified role
        const verifiedRole = guild.roles.cache.get(verificationConfig.roleId);
        
        // Check if bot can assign role
        const canAssign = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssign) {
            logger.warn('Cannot auto-verify: bot cannot assign role', {
                guildId: guild.id,
                userId: member.id,
                roleId: verifiedRole.id
            });
            return {
                autoVerified: false,
                reason: 'bot_cannot_assign_role'
            };
        }

        // Check if already verified
        if (member.roles.cache.has(verifiedRole.id)) {
            return {
                autoVerified: false,
                reason: 'already_verified',
                alreadyHasRole: true
            };
        }

        // Assign role
        await member.roles.add(verifiedRole.id, 'Auto-verified on join');

        // Log auto-verification
        logVerificationAction(client, guild.id, member.id, 'auto_verified', {
            criteria: verificationConfig.autoVerify.criteria,
            accountAge: Date.now() - member.user.createdTimestamp,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name
        });

        logger.info('User auto-verified on join', {
            guildId: guild.id,
            userId: member.id,
            userTag: member.user.tag,
            criteria: verificationConfig.autoVerify.criteria,
            accountAge: Date.now() - member.user.createdTimestamp
        });

        // Send DM notification if configured
        if (shouldSendAutoVerifyDm) {
            await sendAutoVerifyNotification(member, verifiedRole, guild);
        }

        return {
            autoVerified: true,
            userId: member.id,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            criteria: verificationConfig.autoVerify.criteria
        };

    } catch (error) {
        logger.error('Error in auto-verification on join', {
            guildId: guild.id,
            userId: member.id,
            error: error.message
        });
        // Don't throw - auto-verify failure shouldn't break member join
        return {
            autoVerified: false,
            reason: 'auto_verify_error',
            error: error.message
        };
    }
}

/**
 * Remove verification from a user
 * 
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID to remove verification from
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Result object
 */
export async function removeVerification(client, guildId, userId, options = {}) {
    const { moderatorId = null, reason = 'admin_removal' } = options;
    
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                `Guild ${guildId} not found`,
                ErrorTypes.CONFIGURATION,
                "Guild not found.",
                { guildId }
            );
        }

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (error) {
            throw createError(
                `Member ${userId} not found`,
                ErrorTypes.USER_INPUT,
                "User is not in this server.",
                { userId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw createError(
                "Verification system disabled",
                ErrorTypes.CONFIGURATION,
                "The verification system is not enabled.",
                { guildId }
            );
        }

        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        if (!verifiedRole) {
            throw createError(
                "Verified role not found",
                ErrorTypes.CONFIGURATION,
                "The verified role no longer exists.",
                { roleId: guildConfig.verification.roleId }
            );
        }

        if (!member.roles.cache.has(verifiedRole.id)) {
            return {
                success: false,
                notVerified: true,
                message: "User doesn't have the verified role",
                userId
            };
        }

        // Remove role
        await member.roles.remove(
            verifiedRole.id, 
            `Verification removed by ${moderatorId || 'system'}: ${reason}`
        );

        // Log removal
        logVerificationAction(client, guildId, userId, 'removed', {
            removedBy: moderatorId,
            reason,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name
        });

        logger.info('Verification removed from user', {
            guildId,
            userId,
            removedBy: moderatorId,
            reason
        });

        return {
            success: true,
            userId,
            roleId: verifiedRole.id,
            message: "Verification removed successfully"
        };

    } catch (error) {
        logger.error('Error removing verification', {
            guildId,
            userId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Validate that verification setup is still valid
 * Checks that role and channel still exist and bot has permissions
 * 
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {Object} verificationConfig - Verification configuration
 * @throws {TitanBotError} If validation fails
 */
export async function validateVerificationSetup(guild, verificationConfig) {
    // Check verified role exists
    const verifiedRole = guild.roles.cache.get(verificationConfig.roleId);
    if (!verifiedRole) {
        throw createError(
            "Verified role not found",
            ErrorTypes.CONFIGURATION,
            "The verified role was deleted. Please run `/verification setup` again.",
            { roleId: verificationConfig.roleId, guildId: guild.id }
        );
    }

    // Check verification channel exists
    if (verificationConfig.channelId) {
        const channel = guild.channels.cache.get(verificationConfig.channelId);
        if (!channel) {
            throw createError(
                "Verification channel not found",
                ErrorTypes.CONFIGURATION,
                "The verification channel was deleted.",
                { channelId: verificationConfig.channelId, guildId: guild.id }
            );
        }

        // Check bot permissions in channel
        const botPerms = channel.permissionsFor(guild.members.me);
        const requiredPerms = ['SendMessages', 'EmbedLinks'];
        const missingPerms = requiredPerms.filter(perm => !botPerms.has(perm));

        if (missingPerms.length > 0) {
            throw createError(
                "Bot missing permissions in verification channel",
                ErrorTypes.PERMISSION,
                `I'm missing permissions in the verification channel: ${missingPerms.join(', ')}`,
                { missingPerms, channelId: channel.id }
            );
        }
    }

    return true;
}

/**
 * Validate that bot can assign the verified role
 * 
 * @param {import('discord.js').Guild} guild - Discord guild
 * @param {string} roleId - Role ID to check
 * @returns {Promise<boolean>} True if bot can assign role
 */
export async function validateBotCanAssignRole(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    
    if (!role) {
        logger.warn('Cannot assign role - role not found', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    const botMember = guild.members.me;
    
    // Check if bot has ManageRoles permission
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.warn('Cannot assign role - missing ManageRoles permission', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    // Check role hierarchy
    const botHighest = botMember.roles.highest;
    if (role.position >= botHighest.position) {
        logger.warn('Cannot assign role - role hierarchy issue', {
            guildId: guild.id,
            roleId,
            rolePosition: role.position,
            botHighestPosition: botHighest.position
        });
        return false;
    }

    return true;
}

/**
 * Evaluate auto-verify criteria
 * 
 * @param {import('discord.js').GuildMember} member - Guild member
 * @param {Object} autoVerifyConfig - Auto-verify configuration
 * @returns {boolean} True if user meets criteria
 */
function evaluateAutoVerifyCriteria(member, autoVerifyConfig) {
    const { criteria, accountAgeDays } = autoVerifyConfig;

    switch (criteria) {
        case 'account_age': {
            const accountAge = Date.now() - member.user.createdTimestamp;
            const requiredAge = accountAgeDays * 24 * 60 * 60 * 1000;
            return accountAge >= requiredAge;
        }

        case 'server_size':
            return member.guild.memberCount < 1000;

        case 'none':
            return true;

        default:
            logger.warn('Unknown auto-verify criteria', { criteria });
            return false;
    }
}

/**
 * Check if user is on verification cooldown
 * 
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {number} cooldownMs - Cooldown duration in milliseconds (default 5000)
 * @throws {TitanBotError} If on cooldown
 */
export async function checkVerificationCooldown(userId, guildId, cooldownMs = defaultCooldownMs) {
    const key = `${guildId}:${userId}`;
    const lastVerified = verificationCooldowns.get(key);
    
    if (lastVerified && Date.now() - lastVerified < cooldownMs) {
        const remaining = cooldownMs - (Date.now() - lastVerified);
        throw createError(
            "User on verification cooldown",
            ErrorTypes.RATE_LIMIT,
            `Please wait ${Math.ceil(remaining / 1000)} seconds before verifying again.`,
            { userId, guildId, cooldownRemaining: remaining }
        );
    }
    
    verificationCooldowns.set(key, Date.now());
}

/**
 * Track verification attempts for rate limiting
 * 
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {number} maxAttempts - Maximum attempts (default 3)
 * @param {number} windowMs - Time window in milliseconds (default 60000)
 * @throws {TitanBotError} If too many attempts
 */
export async function trackVerificationAttempt(
    userId,
    guildId,
    maxAttempts = defaultMaxAttempts,
    windowMs = defaultAttemptWindowMs
) {
    const key = `${guildId}:${userId}`;
    const attempts = attemptTracker.get(key) || [];
    const now = Date.now();

    // Remove expired attempts
    const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);

    if (recentAttempts.length >= maxAttempts) {
        throw createError(
            "Too many verification attempts",
            ErrorTypes.RATE_LIMIT,
            "You've attempted too many times. Please wait a moment.",
            { attempts: recentAttempts.length, maxAttempts }
        );
    }

    recentAttempts.push(now);
    attemptTracker.set(key, recentAttempts);
}

/**
 * Send auto-verify notification to user
 * 
 * @param {import('discord.js').GuildMember} member - Guild member
 * @param {import('discord.js').Role} role - Verified role
 * @param {import('discord.js').Guild} guild - Guild
 */
async function sendAutoVerifyNotification(member, role, guild) {
    try {
        const { createEmbed } = await import('../utils/embeds.js');
        
        const embed = createEmbed({
            title: "🎉 Welcome to the Server!",
            description: `You have been automatically verified in **${guild.name}**!`,
            fields: [
                {
                    name: "✅ Role Assigned",
                    value: `You now have the ${role} role!`,
                    inline: false
                },
                {
                    name: "📖 What's Next?",
                    value: "You now have access to all server channels and features. Welcome!",
                    inline: false
                }
            ],
            color: 'success'
        });

        await member.send({ embeds: [embed] });
    } catch (error) {
        logger.debug('Could not send auto-verify DM notification', {
            userId: member.id,
            guildId: guild.id,
            reason: error.message
        });
        // Don't throw - DM failure shouldn't break auto-verify
    }
}

/**
 * Log verification action for audit trail
 * 
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} action - Action type ('verified', 'auto_verified', 'removed', 'updated')
 * @param {Object} metadata - Additional metadata
 */
function logVerificationAction(client, guildId, userId, action, metadata = {}) {
    if (!shouldLogVerifications) {
        return;
    }

    logger.info('Verification action', {
        guildId,
        userId,
        action,
        timestamp: new Date().toISOString(),
        metadata
    });

    if (!shouldKeepAuditTrail) {
        return;
    }

    const moderatorId = metadata.moderatorId || metadata.removedBy || null;
    const source = metadata.source || null;

    void insertVerificationAudit({
        guildId,
        userId,
        action,
        source,
        moderatorId,
        metadata,
        createdAt: new Date().toISOString()
    });
}

/**
 * Validate auto-verify criteria configuration
 * 
 * @param {string} criteria - Criteria type
 * @param {number} accountAgeDays - Account age days (if criteria is 'account_age')
 * @throws {TitanBotError} If validation fails
 */
export function validateAutoVerifyCriteria(criteria, accountAgeDays) {
    const validCriteria = ['account_age', 'server_size', 'none'];
    
    if (!validCriteria.includes(criteria)) {
        throw createError(
            `Invalid auto-verify criteria: ${criteria}`,
            ErrorTypes.VALIDATION,
            "Please select a valid criteria option.",
            { criteria, validCriteria }
        );
    }
    
    if (criteria === 'account_age') {
        if (!accountAgeDays || accountAgeDays < 1 || accountAgeDays > 365) {
            throw createError(
                "Invalid account age days",
                ErrorTypes.VALIDATION,
                "Account age must be between 1 and 365 days.",
                { accountAgeDays }
            );
        }
    }
    
    return { criteria, accountAgeDays };
}

export default {
    verifyUser,
    autoVerifyOnJoin,
    removeVerification,
    validateVerificationSetup,
    validateBotCanAssignRole,
    checkVerificationCooldown,
    trackVerificationAttempt,
    validateAutoVerifyCriteria
};

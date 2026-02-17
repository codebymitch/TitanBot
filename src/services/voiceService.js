/**
 * VOICE SERVICE
 * 
 * Centralized business logic for voice channel operations and Discord Activities
 * Handles activity validation, permission checks, and invite generation
 * 
 * Features:
 * - Discord Activity type validation
 * - Voice channel permission verification
 * - Invite link generation with custom settings
 * - Error handling for failed activities
 * - Activity availability checking
 * - Comprehensive error logging and recovery
 * - Rate limiting for invite creation
 * 
 * Usage:
 * import VoiceService from '../../services/voiceService.js';
 * const result = await VoiceService.startActivity(client, member, activityType);
 */

import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { PermissionFlagsBits } from 'discord.js';

// Rate limiting for invites
const inviteCreationLimits = new Map();
const INVITE_CREATION_COOLDOWN = 5 * 1000; // 5 seconds between invites per channel

// Activity type definitions and metadata
const ACTIVITIES = {
    'youtube': {
        id: '880218394199220334',
        name: 'YouTube Together',
        description: 'Watch YouTube videos together',
        icon: '🎥'
    },
    'poker': {
        id: '755827207812677713',
        name: 'Poker Night',
        description: 'Play poker with friends',
        icon: '🃏'
    },
    'chess': {
        id: '832012774040141894',
        name: 'Chess in the Park',
        description: 'Play chess competitively',
        icon: '♟️'
    },
    'checkers': {
        id: '832013003968348200',
        name: 'Checkers in the Park',
        description: 'Play checkers',
        icon: '🔲'
    },
    'letter-league': {
        id: '879863686565621790',
        name: 'Letter League',
        description: 'Word-based competition',
        icon: '📝'
    },
    'spellcast': {
        id: '852509694341283871',
        name: 'SpellCast',
        description: 'Magical word game',
        icon: '✨'
    },
    'sketch': {
        id: '902271654783242291',
        name: 'Sketch Heads',
        description: 'Pictionary-style drawing game',
        icon: '🎨'
    },
    'blazing8s': {
        id: '832025144389533716',
        name: 'Blazing 8s',
        description: 'Fast-paced card game',
        icon: '🔥'
    },
    'puttparty': {
        id: '945737671223947305',
        name: 'Putt Party',
        description: 'Mini-golf competition',
        icon: '⛳'
    },
    'landio': {
        id: '903769130790969345',
        name: 'Land-io',
        description: 'Territory conquest game',
        icon: '🗺️'
    },
    'bobble': {
        id: '947957217959759964',
        name: 'Bobble League',
        description: 'Word-chain game',
        icon: '🎯'
    },
    'knowwhat': {
        id: '976052223358406656',
        name: 'Know What I Mean',
        description: 'Guessing game',
        icon: '🤔'
    }
};

const INVITE_CONFIG = {
    max_age: 86400, // 24 hours
    temporary: false,
    unique: false
};

class VoiceService {

    // ========== CONSTANTS ==========
    static REQUIRED_PERMISSION = PermissionFlagsBits.CreateInstantInvite;
    static INVITE_CREATION_RETRIES = 3;
    static INVITE_CREATION_RETRY_DELAY = 1000;

    /**
     * Get activity metadata by type
     * @param {string} activityType - Activity type/key
     * @returns {Object|null} Activity metadata or null if not found
     */
    static getActivityMetadata(activityType) {
        return ACTIVITIES[activityType] || null;
    }

    /**
     * Get all available activities
     * @returns {Object} All activities with metadata
     */
    static getAllActivities() {
        return ACTIVITIES;
    }

    /**
     * Validate activity type
     * @param {string} activityType - Activity type to validate
     * @returns {Promise<boolean>}
     */
    static async validateActivityType(activityType) {
        logger.debug(`[VOICE_SERVICE] Validating activity type`, { activityType });

        if (!activityType || typeof activityType !== 'string') {
            throw createError(
                'Invalid activity type',
                ErrorTypes.VALIDATION,
                'Activity type must be a non-empty string.',
                { provided: typeof activityType }
            );
        }

        const activity = this.getActivityMetadata(activityType.toLowerCase());
        if (!activity) {
            const validActivities = Object.keys(ACTIVITIES).join(', ');
            throw createError(
                'Unknown activity',
                ErrorTypes.VALIDATION,
                `The activity **${activityType}** does not exist. Available activities: ${validActivities}`,
                { activityType, validActivities: Object.keys(ACTIVITIES) }
            );
        }

        return true;
    }

    /**
     * Validate voice channel and member state
     * @param {GuildMember} member - Guild member
     * @returns {Promise<Object>} Validation result with channel details
     */
    static async validateVoiceChannel(member) {
        logger.debug(`[VOICE_SERVICE] Validating voice channel`, {
            userId: member.id,
            voiceChannelId: member.voice?.channel?.id
        });

        if (!member.voice?.channel) {
            throw createError(
                'Not in voice channel',
                ErrorTypes.VALIDATION,
                'You must be in a voice channel to start an activity.',
                { userId: member.id }
            );
        }

        const channel = member.voice.channel;

        if (!channel.isVoiceBased?.()) {
            throw createError(
                'Invalid channel type',
                ErrorTypes.VALIDATION,
                'You must be in a voice or stage channel.',
                { channelId: channel.id, channelType: channel.type }
            );
        }

        return {
            channelId: channel.id,
            channelName: channel.name,
            guildId: channel.guildId,
            isValid: true
        };
    }

    /**
     * Verify bot permissions in voice channel
     * @param {GuildMember} botMember - Bot member object
     * @param {VoiceChannel} voiceChannel - Voice channel
     * @returns {Promise<Object>} Permission check result
     */
    static async verifyBotPermissions(botMember, voiceChannel) {
        logger.debug(`[VOICE_SERVICE] Verifying bot permissions`, {
            channelId: voiceChannel.id,
            botId: botMember.id
        });

        if (!botMember) {
            throw createError(
                'Bot not found',
                ErrorTypes.VALIDATION,
                'I cannot be found in this guild.',
                { guildId: voiceChannel.guildId }
            );
        }

        const permissions = voiceChannel.permissionsFor(botMember);

        if (!permissions) {
            throw createError(
                'Cannot check permissions',
                ErrorTypes.VALIDATION,
                'I cannot determine permissions for this channel.',
                { channelId: voiceChannel.id }
            );
        }

        const hasCreateInvite = permissions.has(this.REQUIRED_PERMISSION);
        const hasViewChannel = permissions.has(PermissionFlagsBits.ViewChannel);
        const hasConnect = permissions.has(PermissionFlagsBits.Connect);

        if (!hasCreateInvite) {
            logger.warn(`[VOICE_SERVICE] Missing CreateInstantInvite permission`, {
                channelId: voiceChannel.id,
                botId: botMember.id
            });

            throw createError(
                'Missing permission',
                ErrorTypes.VALIDATION,
                'I need the **Create Invite** permission in this voice channel to start an activity.',
                {
                    channelId: voiceChannel.id,
                    missingPermission: 'CreateInstantInvite'
                }
            );
        }

        return {
            channelId: voiceChannel.id,
            hasCreateInvite,
            hasViewChannel,
            hasConnect,
            allRequiredPermissions: hasCreateInvite && hasViewChannel && hasConnect
        };
    }

    /**
     * Verify user permissions (not just bot)
     * @param {GuildMember} member - Guild member
     * @returns {Promise<boolean>}
     */
    static async verifyUserPermissions(member) {
        logger.debug(`[VOICE_SERVICE] Verifying user permissions`, { userId: member.id });

        if (!member.voice?.channel) {
            return false;
        }

        const hasConnect = member.permissions.has(PermissionFlagsBits.Connect);
        const hasPermission = member.voice.channel.permissionsFor(member).has(PermissionFlagsBits.Connect);

        return hasConnect && hasPermission;
    }

    /**
     * Create activity invite with retry logic
     * @param {Client} client - Discord client
     * @param {string} channelId - Voice channel ID
     * @param {string} activityId - Activity application ID
     * @param {string} activityName - Activity display name
     * @returns {Promise<Object>} Invite data
     */
    static async createActivityInvite(client, channelId, activityId, activityName) {
        logger.info(`[VOICE_SERVICE] Creating activity invite`, {
            channelId,
            activityId,
            activityName
        });

        // Check rate limit
        const now = Date.now();
        const lastInvite = inviteCreationLimits.get(channelId);

        if (lastInvite && (now - lastInvite) < INVITE_CREATION_COOLDOWN) {
            const remaining = INVITE_CREATION_COOLDOWN - (now - lastInvite);
            logger.warn(`[VOICE_SERVICE] Invite creation rate limited`, {
                channelId,
                remaining
            });

            throw createError(
                'Rate limited',
                ErrorTypes.RATE_LIMIT,
                `Please wait **${Math.ceil(remaining / 1000)}** seconds before creating another activity invite.`,
                { remaining, cooldown: INVITE_CREATION_COOLDOWN }
            );
        }

        let lastError = null;

        // Retry logic for invite creation
        for (let attempt = 1; attempt <= this.INVITE_CREATION_RETRIES; attempt++) {
            try {
                logger.debug(`[VOICE_SERVICE] Invite creation attempt ${attempt}`, {
                    channelId,
                    activityId
                });

                const invite = await client.rest.post(
                    `/channels/${channelId}/invites`,
                    {
                        body: {
                            max_age: INVITE_CONFIG.max_age,
                            target_type: 2, // Activity type
                            target_application_id: activityId,
                            temporary: INVITE_CONFIG.temporary,
                            unique: INVITE_CONFIG.unique
                        }
                    }
                );

                // Set rate limit
                inviteCreationLimits.set(channelId, now);

                logger.info(`[VOICE_SERVICE] Activity invite created successfully`, {
                    channelId,
                    activityId,
                    activityName,
                    inviteCode: invite.code,
                    attempts: attempt
                });

                return {
                    code: invite.code,
                    url: `https://discord.gg/${invite.code}`,
                    activity: activityName,
                    expiresAt: new Date(now + INVITE_CONFIG.max_age * 1000),
                    createdAt: new Date().toISOString()
                };
            } catch (error) {
                lastError = error;

                if (attempt === this.INVITE_CREATION_RETRIES) {
                    logger.error(`[VOICE_SERVICE] Failed to create invite after ${this.INVITE_CREATION_RETRIES} attempts`, error, {
                        channelId,
                        activityId
                    });
                    break;
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, this.INVITE_CREATION_RETRY_DELAY));
            }
        }

        // Handle final error
        throw createError(
            'Failed to create activity',
            ErrorTypes.DISCORD_API_ERROR,
            `Could not create the **${activityName}** activity. Please try again in a moment.`,
            {
                channelId,
                activityId,
                error: lastError?.message
            }
        );
    }

    /**
     * Start an activity in a voice channel
     * @param {Client} client - Discord client
     * @param {GuildMember} member - User's guild member
     * @param {string} activityType - Activity type
     * @returns {Promise<Object>} Activity start result
     */
    static async startActivity(client, member, activityType) {
        logger.info(`[VOICE_SERVICE] Starting activity`, {
            userId: member.id,
            activityType,
            guildId: member.guild.id
        });

        // Validate activity type
        await this.validateActivityType(activityType);
        const activity = this.getActivityMetadata(activityType.toLowerCase());

        // Validate voice channel
        const voiceStatus = await this.validateVoiceChannel(member);

        // Verify user permissions
        const userHasPerms = await this.verifyUserPermissions(member);
        if (!userHasPerms) {
            throw createError(
                'Permission denied',
                ErrorTypes.VALIDATION,
                'You do not have permission to connect to this voice channel.',
                { channelId: voiceStatus.channelId }
            );
        }

        // Verify bot permissions
        const botMember = member.guild.members.me;
        const channel = member.guild.channels.cache.get(voiceStatus.channelId);
        await this.verifyBotPermissions(botMember, channel);

        // Create invite
        const invite = await this.createActivityInvite(
            client,
            voiceStatus.channelId,
            activity.id,
            activity.name
        );

        logger.info(`[VOICE_SERVICE] Activity started successfully`, {
            userId: member.id,
            guildId: member.guild.id,
            activityType,
            channelId: voiceStatus.channelId,
            activityName: activity.name,
            inviteCode: invite.code,
            timestamp: invite.createdAt
        });

        return {
            success: true,
            activity: activity.name,
            icon: activity.icon,
            description: activity.description,
            channel: voiceStatus.channelName,
            inviteUrl: invite.url,
            inviteCode: invite.code,
            expiresAt: invite.expiresAt
        };
    }

    /**
     * Get activity suggestions for a guild
     * @returns {Array} Array of activity suggestions
     */
    static getActivitySuggestions() {
        return Object.entries(ACTIVITIES).map(([key, activity]) => ({
            key,
            name: activity.name,
            icon: activity.icon,
            description: activity.description
        }));
    }

    /**
     * Format activity list for display
     * @returns {string} Formatted list of activities
     */
    static formatActivityList() {
        return Object.entries(ACTIVITIES)
            .map(([key, activity]) => `${activity.icon} **${activity.name}** (\`${key}\`) - ${activity.description}`)
            .join('\n');
    }
}

export default VoiceService;

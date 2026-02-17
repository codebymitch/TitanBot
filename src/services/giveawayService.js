import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { getColor } from '../config/bot.js';
import { getEndedGiveaways, markGiveawayEnded } from '../utils/database.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

// Rate limiting store for button interactions
const userGiveawayInteractions = new Map();
const GIVEAWAY_INTERACTION_COOLDOWN = 1000; // 1 second between interactions

/**
 * Parse and validate duration string (e.g., "1h", "30m", "5d")
 * @param {string} durationString - Duration string to parse
 * @returns {number|null} Duration in milliseconds, or null if invalid
 * @throws {TitanBotError} If duration is invalid
 */
export function parseDuration(durationString) {
    if (!durationString || typeof durationString !== 'string') {
        throw new TitanBotError(
            'Invalid duration format provided',
            ErrorTypes.VALIDATION,
            'Please provide a valid duration (e.g., 1h, 30m, 5d, 10s).',
            { durationString }
        );
    }

    const regex = /^(\d+)([hmds])$/i;
    const match = durationString.trim().match(regex);

    if (!match) {
        throw new TitanBotError(
            `Invalid duration format: ${durationString}`,
            ErrorTypes.VALIDATION,
            'Invalid duration format. Use: 1h, 30m, 5d, 10s (min: 10s, max: 30d)',
            { input: durationString }
        );
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (amount <= 0 || amount > 999) {
        throw new TitanBotError(
            `Duration amount out of range: ${amount}`,
            ErrorTypes.VALIDATION,
            'Duration amount must be between 1 and 999.',
            { amount, unit }
        );
    }

    let ms = 0;
    switch (unit) {
        case 's':
            ms = amount * 1000;
            break;
        case 'm':
            ms = amount * 60 * 1000;
            break;
        case 'h':
            ms = amount * 60 * 60 * 1000;
            break;
        case 'd':
            ms = amount * 24 * 60 * 60 * 1000;
            break;
        default:
            throw new TitanBotError(
                `Unknown duration unit: ${unit}`,
                ErrorTypes.VALIDATION,
                'Please use s (seconds), m (minutes), h (hours), or d (days).',
                { unit }
            );
    }

    const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30 days
    if (ms > maxDuration) {
        throw new TitanBotError(
            `Duration exceeds maximum: ${ms}ms > ${maxDuration}ms`,
            ErrorTypes.VALIDATION,
            'Maximum duration is 30 days.',
            { requestedMs: ms, maxMs: maxDuration }
        );
    }

    const minDuration = 10 * 1000; // 10 seconds
    if (ms < minDuration) {
        throw new TitanBotError(
            `Duration below minimum: ${ms}ms < ${minDuration}ms`,
            ErrorTypes.VALIDATION,
            'Minimum duration is 10 seconds.',
            { requestedMs: ms, minMs: minDuration }
        );
    }

    return ms;
}

/**
 * Validate giveaway prize string
 * @param {string} prize - Prize to validate
 * @throws {TitanBotError} If prize is invalid
 */
export function validatePrize(prize) {
    if (!prize || typeof prize !== 'string') {
        throw new TitanBotError(
            'Prize must be a non-empty string',
            ErrorTypes.VALIDATION,
            'Please provide a valid prize description.',
            { prize }
        );
    }

    const trimmed = prize.trim();
    if (trimmed.length === 0 || trimmed.length > 256) {
        throw new TitanBotError(
            `Prize length out of range: ${trimmed.length}`,
            ErrorTypes.VALIDATION,
            'Prize must be between 1 and 256 characters.',
            { length: trimmed.length }
        );
    }

    return trimmed;
}

/**
 * Validate winner count
 * @param {number} winnerCount - Number of winners to validate
 * @throws {TitanBotError} If winner count is invalid
 */
export function validateWinnerCount(winnerCount) {
    if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 10) {
        throw new TitanBotError(
            `Invalid winner count: ${winnerCount}`,
            ErrorTypes.VALIDATION,
            'Winner count must be between 1 and 10.',
            { winnerCount }
        );
    }
}

/**
 * Create a giveaway embed for display
 * @param {Object} giveaway - Giveaway data
 * @param {string} status - Status ('active', 'ended', 'reroll')
 * @param {Array<string>} winners - Array of winner user IDs
 * @returns {EmbedBuilder} Formatted embed
 */
export function createGiveawayEmbed(giveaway, status, winners = []) {
    try {
        const statusEmoji = status === 'ended' ? '🎉' : status === 'reroll' ? '🔄' : '🎉';
        const isEnded = status === 'ended' || status === 'reroll';
        const color = isEnded ? getColor('giveaway.ended') : getColor('giveaway.active');
        
        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} ${giveaway.prize}`)
            .setDescription('React with the button below to enter!')
            .setColor(color)
            .addFields(
                { name: '👤 Hosted by', value: `<@${giveaway.hostId}>`, inline: true },
                { name: '🏆 Winners', value: giveaway.winnerCount.toString(), inline: true },
                { name: '👥 Entries', value: giveaway.participants?.length?.toString() || '0', inline: true }
            );

        if (isEnded) {
            const winnerDisplay = winners.length > 0 
                ? winners.map(id => `<@${id}>`).join(', ')
                : 'No valid entries';
            embed.addFields({ name: '🎯 Winners', value: winnerDisplay, inline: false });
        } else {
            const endTime = giveaway.endsAt || giveaway.endTime;
            embed.addFields({ name: '⏰ Ends', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: false });
        }

        embed.setFooter({ text: `Giveaway ID: ${giveaway.messageId}` });
        embed.setTimestamp();
        
        return embed;
    } catch (error) {
        logger.error('Error creating giveaway embed:', error);
        throw new TitanBotError(
            'Failed to create giveaway embed',
            ErrorTypes.UNKNOWN,
            'An internal error occurred while formatting the giveaway.',
            { error: error.message }
        );
    }
}

/**
 * Create action row with giveaway buttons
 * @param {boolean} ended - Whether giveaway has ended
 * @returns {ActionRowBuilder} Action row with buttons
 */
export function createGiveawayButtons(ended = false) {
    try {
        const row = new ActionRowBuilder();

        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Reroll')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ View Winners')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Join')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 End')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(false)
            );
        }

        return row;
    } catch (error) {
        logger.error('Error creating giveaway buttons:', error);
        throw new TitanBotError(
            'Failed to create giveaway buttons',
            ErrorTypes.UNKNOWN,
            'An internal error occurred while creating interactive buttons.',
            { error: error.message }
        );
    }
}

/**
 * Pick random winners from participants with validation
 * @param {Array<string>} participants - Array of user IDs
 * @param {number} winnerCount - Number of winners to select
 * @returns {Array<string>} Array of winner user IDs
 * @throws {TitanBotError} If validation fails
 */
export function selectWinners(participants, winnerCount) {
    if (!Array.isArray(participants) || participants.length === 0) {
        return [];
    }

    if (!Number.isInteger(winnerCount) || winnerCount < 1) {
        throw new TitanBotError(
            'Invalid winner count for selection',
            ErrorTypes.VALIDATION,
            'Winner count must be at least 1.',
            { winnerCount }
        );
    }

    const requested = Math.min(winnerCount, participants.length);
    
    try {
        // Fisher-Yates shuffle for better randomization
        const shuffled = [...participants];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, requested);
    } catch (error) {
        logger.error('Error selecting winners:', error);
        throw new TitanBotError(
            'Failed to select winners',
            ErrorTypes.UNKNOWN,
            'An error occurred while selecting winners.',
            { error: error.message, participantCount: participants.length }
        );
    }
}

/**
 * Check if user is rate-limited for giveaway interactions
 * @param {string} userId - User ID to check
 * @param {string} giveawayId - Giveaway message ID
 * @returns {boolean} True if user is rate-limited
 */
export function isUserRateLimited(userId, giveawayId) {
    const key = `${userId}:${giveawayId}`;
    const lastInteraction = userGiveawayInteractions.get(key);
    
    if (!lastInteraction) {
        return false;
    }

    const elapsed = Date.now() - lastInteraction;
    return elapsed < GIVEAWAY_INTERACTION_COOLDOWN;
}

/**
 * Record user interaction for rate limiting
 * @param {string} userId - User ID
 * @param {string} giveawayId - Giveaway message ID
 */
export function recordUserInteraction(userId, giveawayId) {
    const key = `${userId}:${giveawayId}`;
    userGiveawayInteractions.set(key, Date.now());

    // Cleanup old entries every minute
    if (userGiveawayInteractions.size > 10000) {
        const now = Date.now();
        const cutoff = now - (60 * 1000); // 1 minute ago

        for (const [k, v] of userGiveawayInteractions.entries()) {
            if (v < cutoff) {
                userGiveawayInteractions.delete(k);
            }
        }
    }
}

/**
 * End a giveaway and select winners with transaction-like handling
 * @param {Object} client - Discord client
 * @param {Object} giveaway - Giveaway data
 * @param {string} guildId - Guild ID
 * @param {string} endedBy - User ID who ended the giveaway
 * @returns {Promise<Object>} Result with winners and status
 * @throws {TitanBotError} If operation fails
 */
export async function endGiveaway(client, giveaway, guildId, endedBy) {
    try {
        if (!giveaway) {
            throw new TitanBotError(
                'Giveaway object is null or undefined',
                ErrorTypes.VALIDATION,
                'Cannot end a non-existent giveaway.',
                { giveaway }
            );
        }

        if (giveaway.ended === true || giveaway.isEnded === true) {
            throw new TitanBotError(
                `Giveaway ${giveaway.messageId} is already ended`,
                ErrorTypes.VALIDATION,
                'This giveaway has already ended.',
                { giveawayId: giveaway.messageId, status: 'already_ended' }
            );
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);
        
        // Update giveaway state atomically
        const updatedGiveaway = {
            ...giveaway,
            ended: true,
            isEnded: true,
            winnerIds: winners,
            endedAt: new Date().toISOString(),
            endedBy: endedBy,
            participantCount: participants.length
        };

        logger.info(`Ending giveaway ${giveaway.messageId}: selected ${winners.length} winners from ${participants.length} entries`);

        return {
            success: true,
            giveaway: updatedGiveaway,
            winners: winners,
            participantCount: participants.length
        };
    } catch (error) {
        logger.error('Error ending giveaway:', error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            'Failed to end giveaway',
            ErrorTypes.UNKNOWN,
            'An error occurred while ending the giveaway.',
            { error: error.message, giveawayId: giveaway?.messageId }
        );
    }
}

/**
 * Check for ended giveaways across all guilds and process them
 * Uses SQL queries to find only giveaways that have ended (optimized with index)
 * @param {Object} client - The Discord client
 */
export async function checkGiveaways(client) {
  try {
    if (!client.db) {
      logger.warn('Database not available for giveaway check');
      return;
    }

    // Get all giveaways that have ended (uses SQL index on ends_at)
    const endedGiveaways = await getEndedGiveaways(client);
    
    if (endedGiveaways.length === 0) {
      return;
    }

    logger.info(`Processing ${endedGiveaways.length} ended giveaways`);

    for (const giveawayRecord of endedGiveaways) {
      try {
        const { id: giveawayId, guild_id: guildId, message_id: messageId, data: giveawayData } = giveawayRecord;
        const giveaway = typeof giveawayData === 'string' ? JSON.parse(giveawayData) : giveawayData;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          logger.debug(`Guild ${guildId} not found, skipping giveaway ${messageId}`);
          continue;
        }

        const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) {
          logger.debug(`Channel ${giveaway.channelId} not found for giveaway ${messageId}`);
          continue;
        }

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
          logger.debug(`Message ${messageId} not found for giveaway in channel ${giveaway.channelId}`);
          continue;
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const winnerMentions = winners.length > 0
          ? winners.map(id => `<@${id}>`).join(', ')
          : 'No valid entries!';

        // Create ended embed using centralized function
        const endedEmbed = createGiveawayEmbed(giveaway, 'ended', winners);

        await message.edit({
          embeds: [endedEmbed],
          components: [createGiveawayButtons(true)]
        });

        // Update giveaway state atomically
        giveaway.ended = true;
        giveaway.isEnded = true;
        giveaway.winnerIds = winners;
        giveaway.endedAt = new Date().toISOString();
        
        // Update in database with SQL
        const markedSuccess = await markGiveawayEnded(client, giveawayId, giveaway);
        if (!markedSuccess) {
          logger.warn(`Failed to mark giveaway ${messageId} as ended in database`);
        }

        if (winners.length > 0) {
          const winnerAnnouncement = `🎉 Congratulations ${winnerMentions}! You won the **${giveaway.prize || 'giveaway'}**! Please contact <@${giveaway.hostId}> to claim your prize.`;
          await channel.send({ content: winnerAnnouncement });

          // Log giveaway winner event
          try {
            await logEvent({
              client,
              guildId,
              eventType: EVENT_TYPES.GIVEAWAY_WINNER,
              data: {
                description: `Giveaway ended with ${winners.length} winner(s)`,
                channelId: channel.id,
                fields: [
                  {
                    name: '🎁 Prize',
                    value: giveaway.prize || 'Mystery Prize!',
                    inline: true
                  },
                  {
                    name: '🏆 Winners',
                    value: winners.map(id => `<@${id}>`).join(', '),
                    inline: false
                  },
                  {
                    name: '👥 Entries',
                    value: participants.length.toString(),
                    inline: true
                  }
                ]
              }
            });
          } catch (error) {
            logger.debug('Error logging giveaway winner:', error);
          }
        } else {
          await channel.send({ content: `The giveaway for **${giveaway.prize}** has ended with no valid entries.` });
        }

        logger.info(`Ended giveaway ${messageId} in guild ${guildId}`);
      } catch (error) {
        logger.error(`Error processing giveaway:`, error);
      }
    }
  } catch (error) {
    logger.error('Error checking giveaways:', error);
  }
}




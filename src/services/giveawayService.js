import { pickWinners } from '../utils/giveaways.js';
import { getEndedGiveaways, markGiveawayEnded } from '../utils/database.js';
import { logger } from '../utils/logger.js';

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
        const winners = pickWinners(participants, giveaway.winnerCount || 1);

        const winnerMentions = winners.length > 0
          ? winners.map(id => `<@${id}>`).join(', ')
          : 'No valid entries!';

        const embed = message.embeds[0]?.data || {};
        const endedEmbed = {
          ...embed,
          title: 'ðŸŽ‰ Giveaway Ended!',
          fields: [
            { name: 'Winners', value: winnerMentions, inline: true },
            { name: 'Entries', value: participants.length.toString(), inline: true },
            { name: 'Prize', value: giveaway.prize || 'Mystery Prize!', inline: true }
          ],
          color: 0xff0000,
          footer: { text: 'Giveaway ended' },
          timestamp: new Date().toISOString()
        };

        await message.edit({
          embeds: [endedEmbed],
          components: []
        });

        // Make the giveaway data ended
        giveaway.ended = true;
        
        // Update in database with SQL
        const markedSuccess = await markGiveawayEnded(client, giveawayId, giveaway);
        if (!markedSuccess) {
          logger.warn(`Failed to mark giveaway ${messageId} as ended in database`);
        }

        if (winners.length > 0) {
          const winnerAnnouncement = `ðŸŽ‰ Congratulations ${winnerMentions}! You won the **${giveaway.prize || 'giveaway'}**!`;
          await channel.send({ content: winnerAnnouncement });
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


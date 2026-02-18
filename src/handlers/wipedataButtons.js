import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';

/**
 * Handle wipedata confirmation button
 * Deletes all user data from the database
 */
const wipedataConfirmHandler = {
  name: 'wipedata_yes',
  async execute(interaction, client) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      
      const dataKeyPatterns = [
        `economy:${guildId}:${userId}`,
        `level:${guildId}:${userId}`,
        `xp:${guildId}:${userId}`,
        `inventory:${guildId}:${userId}`,
        `bank:${guildId}:${userId}`,
        `wallet:${guildId}:${userId}`,
        `cooldowns:${guildId}:${userId}`,
        `shop:${guildId}:${userId}`,
        `shop_data:${guildId}:${userId}`,
        `counter:${guildId}:${userId}`,
        `birthday:${guildId}:${userId}`,
        `balance:${guildId}:${userId}`,
        `user:${guildId}:${userId}`,
        `leveling:${guildId}:${userId}`,
        `crimexp:${guildId}:${userId}`,
        `robxp:${guildId}:${userId}`,
        `crime_cooldown:${guildId}:${userId}`,
        `rob_cooldown:${guildId}:${userId}`,
        `lastDaily:${guildId}:${userId}`,
        `lastWork:${guildId}:${userId}`,
        `lastCrime:${guildId}:${userId}`,
        `lastRob:${guildId}:${userId}`,
      ];

      let deletedCount = 0;
      const deleteErrors = [];

      
      for (const key of dataKeyPatterns) {
        try {
          const exists = await client.db.exists(key);
          if (exists) {
            await client.db.delete(key);
            deletedCount++;
          }
        } catch (error) {
          logger.error(`Error deleting key ${key}:`, error);
          deleteErrors.push(key);
        }
      }

      
      try {
        if (client.db.list && typeof client.db.list === 'function') {
          const searchPrefixes = [
            `${guildId}:${userId}`,
            `${guildId}:`,
            `economy:${guildId}:`,
            `level:${guildId}:`,
            `xp:${guildId}:`,
            `user:${guildId}:`
          ];

          const discoveredKeys = new Set();

          for (const prefix of searchPrefixes) {
            try {
              const keys = await client.db.list(prefix);
              if (Array.isArray(keys)) {
                keys.forEach((key) => discoveredKeys.add(key));
              }
            } catch (listError) {
              logger.debug(`Key listing failed for prefix ${prefix}:`, listError);
            }
          }

          const additionalUserKeys = [...discoveredKeys].filter((key) => {
            if (dataKeyPatterns.includes(key)) return false;
            return typeof key === 'string' && key.includes(`${guildId}:${userId}`);
          });

          for (const key of additionalUserKeys) {
            try {
              await client.db.delete(key);
              deletedCount++;
            } catch (error) {
              logger.error(`Error deleting additional key ${key}:`, error);
              deleteErrors.push(key);
            }
          }
        }
      } catch (error) {
        logger.warn('Could not perform prefix search on database:', error);
      }

      const successMessage =
        `✅ **Your data has been successfully wiped!**\n\n` +
        `**Records Deleted:** ${deletedCount}\n\n` +
        `Your account has been reset to default values. You can now start fresh!\n\n` +
        `*All your economy balance, levels, items, and personal data have been removed.*`;

      await interaction.editReply({
        embeds: [successEmbed(successMessage, '🗑️ Data Wipe Complete')],
        components: []
      });

      logger.info(`User ${interaction.user.tag} (${userId}) wiped their data in guild ${guildId} - Deleted ${deletedCount} records`);
      if (deleteErrors.length > 0) {
        logger.warn(`Data wipe completed with ${deleteErrors.length} deletion errors for user ${userId} in guild ${guildId}`);
      }

    } catch (error) {
      logger.error('Wipedata confirm button handler error:', error);
      
      await interaction.editReply({
        embeds: [errorEmbed('Data Wipe Failed', 'An error occurred while wiping your data. Please try again later or contact support.')],
        components: []
      });
    }
  }
};





const wipedataCancelHandler = {
  name: 'wipedata_no',
  async execute(interaction, client) {
    try {
      await interaction.update({
        embeds: [
          createEmbed({
            title: '❌ Data Wipe Cancelled',
            description: 'Your data has been preserved. Your account remains unchanged.',
            color: 'info'
          })
        ],
        components: []
      });

      logger.info(`User ${interaction.user.tag} (${interaction.user.id}) cancelled data wipe in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Wipedata cancel button handler error:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'Could not cancel data wipe.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

export { wipedataConfirmHandler, wipedataCancelHandler };





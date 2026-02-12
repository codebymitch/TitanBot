import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { MessageFlags } from 'discord.js';

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

      // List of all possible data keys for a user that should be wiped
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

      // Delete each data key
      for (const key of dataKeyPatterns) {
        try {
          const exists = await client.db.exists(key);
          if (exists) {
            await client.db.delete(key);
            deletedCount++;
          }
        } catch (error) {
          console.error(`Error deleting key ${key}:`, error);
          deleteErrors.push(key);
        }
      }

      // Check for any additional user-related keys by prefix search if available
      try {
        if (client.db.list && typeof client.db.list === 'function') {
          const userPrefix = `${guildId}:${userId}`;
          const allKeys = await client.db.list(userPrefix);
          
          if (Array.isArray(allKeys)) {
            for (const key of allKeys) {
              if (!dataKeyPatterns.includes(key)) {
                try {
                  await client.db.delete(key);
                  deletedCount++;
                } catch (error) {
                  console.error(`Error deleting additional key ${key}:`, error);
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn('Could not perform prefix search on database:', error);
      }

      const successMessage =
        `âœ… **Your data has been successfully wiped!**\n\n` +
        `**Records Deleted:** ${deletedCount}\n\n` +
        `Your account has been reset to default values. You can now start fresh!\n\n` +
        `*All your economy balance, levels, items, and personal data have been removed.*`;

      await interaction.editReply({
        embeds: [successEmbed(successMessage, 'ðŸ—‘ï¸ Data Wipe Complete')],
        components: []
      });

      console.log(`âœ… User ${interaction.user.tag} (${userId}) wiped their data in guild ${guildId} - Deleted ${deletedCount} records`);

    } catch (error) {
      console.error('Wipedata confirm button handler error:', error);
      
      await interaction.editReply({
        embeds: [errorEmbed('Data Wipe Failed', 'An error occurred while wiping your data. Please try again later or contact support.')],
        components: []
      });
    }
  }
};

/**
 * Handle wipedata cancellation button
 * Simply closes the confirmation prompt
 */
const wipedataCancelHandler = {
  name: 'wipedata_no',
  async execute(interaction, client) {
    try {
      await interaction.update({
        embeds: [
          createEmbed({
            title: 'âŒ Data Wipe Cancelled',
            description: 'Your data has been preserved. Your account remains unchanged.',
            color: 'info'
          })
        ],
        components: []
      });

      console.log(`â„¹ï¸ User ${interaction.user.tag} (${interaction.user.id}) cancelled data wipe in guild ${interaction.guildId}`);
    } catch (error) {
      console.error('Wipedata cancel button handler error:', error);
      
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



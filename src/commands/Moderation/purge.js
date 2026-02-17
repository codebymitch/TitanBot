import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete a specific amount of messages")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages (1-100)")
        .setRequired(true),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: "moderation",

  async execute(interaction, config, client) {

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return await interaction.editReply({
        embeds: [
          errorEmbed(
            "Permission Denied",
            "You need the `Manage Messages` permission to purge messages.",
          ),
        ],
      });

    const amount = interaction.options.getInteger("amount");
    const channel = interaction.channel;

    if (amount < 1 || amount > 100)
      return await interaction.editReply({
        embeds: [
          errorEmbed(
            "Invalid Amount",
            "Please specify a number between 1 and 100.",
          ),
        ],
      });

    try {
      // Check rate limit - 5 purges per minute
      const rateLimitKey = `purge_${interaction.user.id}`;
      const isAllowed = await checkRateLimit(rateLimitKey, 5, 60000);
      if (!isAllowed) {
        return await interaction.editReply({
          embeds: [
            warningEmbed(
              "You're purging messages too fast. Please wait a minute before trying again.",
              "⏳ Rate Limited"
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const fetched = await channel.messages.fetch({ limit: amount });
      const deleted = await channel.bulkDelete(fetched, true);
      const deletedCount = deleted.size;

      const purgeEmbed = createEmbed(
        "🗑️ Messages Purged (Action Log)",
        `${deletedCount} messages were deleted by ${interaction.user}.`,
      )
.setColor(getColor('moderation'))
        .addFields(
          { name: "Channel", value: channel.toString(), inline: true },
          {
            name: "Moderator",
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true,
          },
          { name: "Count", value: `${deletedCount} messages`, inline: false },
        );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Messages Purged",
          target: `${channel} (${deletedCount} messages)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Deleted ${deletedCount} messages`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id
          }
        }
      });

      await interaction.editReply({
        embeds: [
          successEmbed(`🗑️ Deleted ${deletedCount} messages in ${channel}.`),
        ],
flags: MessageFlags.Ephemeral,
      });

      setTimeout(() => {
        interaction.deleteReply().catch(err => 
          logger.debug('Failed to auto-delete purge response:', err)
        );
      }, 3000);
    } catch (error) {
      logger.error('Purge command error:', error);
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "An unexpected error occurred during message deletion. Note: Messages older than 14 days cannot be bulk deleted.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
};




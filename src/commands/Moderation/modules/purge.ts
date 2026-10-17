import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags, type GuildTextBasedChannel } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { logEvent } from '../../../utils/moderation.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Eine bestimmte Anzahl an Nachrichten löschen")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Anzahl der Nachrichten (1-100)")
        .setRequired(true),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: "moderation",
  abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, {
      flags: MessageFlags.Ephemeral,
    });
    if (!deferSuccess) {
      logger.warn(`Purge interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'purge'
      });
      return;
    }

    const amount = interaction.options.getInteger("amount")!;
    const channel = interaction.channel as GuildTextBasedChannel;

    if (amount < 1 || amount > 100)
      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte gib eine Zahl zwischen 1 und 100 an.' });

    try {
      const fetched = await channel.messages.fetch({ limit: amount });
      const deleted = await channel.bulkDelete(fetched, true);
      const deletedCount = deleted.size;

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Messages Purged",
          target: `${channel} (${deletedCount} Nachrichten)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `${deletedCount} Nachrichten gelöscht`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            "Nachrichten gelöscht",
            `${deletedCount} Nachrichten in ${channel} gelöscht.`,
          ),
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
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Löschen der Nachrichten ist ein unerwarteter Fehler aufgetreten. Hinweis: Nachrichten, die älter als 14 Tage sind, können nicht gesammelt gelöscht werden.' });
    }
  }
} satisfies Command;
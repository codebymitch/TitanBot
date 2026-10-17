import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { Command } from '../../../types/index.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Zeigt, wie lange der Bot schon online ist"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      let totalSeconds = interaction.client.uptime / 1000;
      let days = Math.floor(totalSeconds / 86400);
      totalSeconds %= 86400;
      let hours = Math.floor(totalSeconds / 3600);
      totalSeconds %= 3600;
      let minutes = Math.floor(totalSeconds / 60);
      let seconds = Math.floor(totalSeconds % 60);

      const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ 
          title: "System-Uptime", 
          description: `\`\`\`${uptimeStr}\`\`\`` 
        })],
      });
    } catch (error) {
      logger.error('Uptime command error:', error);
      
      try {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({ title: 'Systemfehler', description: 'Uptime konnte nicht berechnet werden.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
} satisfies Command;
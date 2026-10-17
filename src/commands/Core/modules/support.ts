import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import type { Command } from '../../../types/index.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
const SUPPORT_URL = "https://github.com/Robertwlt03/NexoBot/issues";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Hilfe bekommen und Probleme auf GitHub melden"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("GitHub-Issues öffnen")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_URL);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ title: "Brauchst du Hilfe?", description: "Du brauchst Hilfe, hast einen Bug gefunden oder eine Idee für ein Feature? Eröffne ein Issue auf GitHub." }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'Systemfehler', description: 'Support-Infos konnten nicht angezeigt werden.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
} satisfies Command;
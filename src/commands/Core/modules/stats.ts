import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import type { Command } from '../../../types/index.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Statistiken des Bots anzeigen"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMembers = interaction.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0,
      );
      const nodeVersion = process.version;

      const embed = createEmbed({ title: "Systemstatistiken", description: "Leistungswerte in Echtzeit." }).addFields(
        { name: "Servers", value: `${totalGuilds}`, inline: true },
        { name: "Nutzer", value: `${totalMembers}`, inline: true },
        { name: "Node.js", value: `${nodeVersion}`, inline: true },
        { name: "Discord.js", value: `v${version}`, inline: true },
        {
          name: "Speicherverbrauch",
          value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          inline: true,
        },
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Stats command error:', error);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ title: 'Systemfehler', description: 'Systemstatistiken konnten nicht abgerufen werden.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
} satisfies Command;
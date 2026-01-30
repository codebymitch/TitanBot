import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Core/uptime.js
export default {
    data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Check how long the bot has been online"),

  async execute(interaction) {
    let totalSeconds = interaction.client.uptime / 1000;
    let days = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;
    let hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = Math.floor(totalSeconds % 60);

    const uptimeStr = `${days}d, ${hours}h, ${minutes}m, ${seconds}s`;

    await interaction.reply({
      embeds: [createEmbed({ title: "⏱️ System Uptime", description: `**${uptimeStr}**` })],
    });
  },
};

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Core/stats.js
export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View bot statistics"),

  async execute(interaction) {
    const totalGuilds = interaction.client.guilds.cache.size;
    const totalMembers = interaction.client.guilds.cache.reduce(
      (acc, guild) => acc + guild.memberCount,
      0,
    );
    const nodeVersion = process.version;

    const embed = createEmbed(
      "📊 System Statistics",
      "Real-time performance metrics.",
    ).addFields(
      { name: "Servers", value: `${totalGuilds}`, inline: true },
      { name: "Users", value: `${totalMembers}`, inline: true },
      { name: "Node.js", value: `${nodeVersion}`, inline: true },
      { name: "Discord.js", value: `v${djsVersion}`, inline: true },
      {
        name: "Memory Usage",
        value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        inline: true,
      },
    );

    await interaction.reply({ embeds: [embed] });
  },
};

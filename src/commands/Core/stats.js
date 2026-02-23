import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View bot statistics"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMembers = interaction.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0,
      );
      const nodeVersion = process.version;

      const embed = createEmbed({ title: "📊 System Statistics", description: "Real-time performance metrics." }).addFields(
        { name: "Servers", value: `${totalGuilds}`, inline: true },
        { name: "Users", value: `${totalMembers}`, inline: true },
        { name: "Node.js", value: `${nodeVersion}`, inline: true },
        { name: "Discord.js", value: `v${version}`, inline: true },
        {
          name: "Memory Usage",
          value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          inline: true,
        },
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      console.error('Stats command error:', error);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ title: 'System Error', description: 'Could not fetch system statistics.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};





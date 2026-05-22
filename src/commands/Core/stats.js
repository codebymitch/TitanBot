import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View bot statistics"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction, { ephemeral: true });
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMembers = interaction.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0,
      );
      const nodeVersion = process.version;
      const uptimeStr = formatUptime(process.uptime());
      const activePlayers = interaction.client.musicPanels?.size ?? 0;

      const embed = createEmbed({ title: "📊 System Statistics", description: "Real-time performance metrics." }).addFields(
        { name: "Servers", value: `${totalGuilds}`, inline: true },
        { name: "Users", value: `${totalMembers}`, inline: true },
        { name: "Uptime", value: uptimeStr, inline: true },
        { name: "Node.js", value: `${nodeVersion}`, inline: true },
        { name: "Discord.js", value: `v${version}`, inline: true },
        {
          name: "Memory Usage",
          value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          inline: true,
        },
        { name: "Active Music Sessions", value: `${activePlayers}`, inline: true },
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Stats command error:', error);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ title: 'System Error', description: 'Could not fetch system statistics.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};





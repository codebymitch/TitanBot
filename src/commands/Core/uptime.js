import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
    data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Check how long the bot has been online"),

  async execute(interaction) {
    try {
      await interaction.deferReply();
      
      let totalSeconds = interaction.client.uptime / 1000;
      let days = Math.floor(totalSeconds / 86400);
      totalSeconds %= 86400;
      let hours = Math.floor(totalSeconds / 3600);
      totalSeconds %= 3600;
      let minutes = Math.floor(totalSeconds / 60);
      let seconds = Math.floor(totalSeconds % 60);

      const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      await interaction.editReply({
        embeds: [createEmbed({ 
          title: "⏱️ System Uptime", 
          description: `\`\`\`${uptimeStr}\`\`\`` 
        })],
      });
    } catch (error) {
      console.error('Uptime command error:', error);
      
      try {
        return await interaction.editReply({
          embeds: [createEmbed({ title: 'System Error', description: 'Could not compute uptime.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        console.error('Failed to send error reply:', replyError);
      }
    }
  },
};





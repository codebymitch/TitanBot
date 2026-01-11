import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  
  async execute(interaction, client) {
    try {
      const sent = await interaction.reply({ 
        content: 'Pinging...',
        fetchReply: true,
        ephemeral: true
      });
      
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = Math.round(client.ws.ping);
      
      await interaction.editReply({
        content: `🏓 Pong!\nLatency: ${latency}ms\nAPI Latency: ${apiLatency}ms`,
        ephemeral: true
      });
      
      logger.info(`Ping command executed by ${interaction.user.tag} - Latency: ${latency}ms, API: ${apiLatency}ms`);
    } catch (error) {
      logger.error('Error in ping command:', error);
      
      if (!interaction.replied) {
        await interaction.reply({
          content: 'There was an error executing the ping command!',
          ephemeral: true
        }).catch(console.error);
      } else {
        await interaction.followUp({
          content: 'There was an error executing the ping command!',
          ephemeral: true
        }).catch(console.error);
      }
    }
  },
};

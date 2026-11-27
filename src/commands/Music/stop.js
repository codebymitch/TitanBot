const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { DisTubeError } = require('distube'); 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music and clear the queue.'),
  
  async execute(interaction) {
    const channel = interaction.member.voice.channel;
  
    if (!channel) {
      const embed = new EmbedBuilder()
        .setColor('#FF0000') 
        .setTitle('Error')
        .setDescription('You need to be in a voice channel to stop the music.');
      
      return interaction.reply({ embeds: [embed] });
    }
  
    try {
      const queue = interaction.client.playerManager.distube.getQueue(channel);
      
      if (!queue || !queue.songs.length) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000') 
          .setTitle('No Queue')
          .setDescription('There is no music playing or the queue is empty.');
        
        return interaction.reply({ embeds: [embed] });
      }

      await interaction.client.playerManager.distube.stop(channel);

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Music Stopped')
        .setDescription('🛑 The music has been stopped and the queue has been cleared.');
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Stop Error:', error);

      let embed;
      
      if (error instanceof DisTubeError) {
        if (error.errorCode === 'NO_QUEUE') {
          embed = new EmbedBuilder()
            .setColor('#FF0000') 
            .setTitle('No Queue')
            .setDescription('There is no queue to stop.');
        } else {
          embed = new EmbedBuilder()
            .setColor('#FF0000') 
            .setTitle('Error')
            .setDescription('An error occurred while stopping the music.');
        }
      } else {
        embed = new EmbedBuilder()
          .setColor('#FF0000') 
          .setTitle('Error')
          .setDescription('An error occurred while stopping the music.');
      }

      await interaction.reply({ embeds: [embed] });
    }
  },
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('previous')
      .setDescription('Play the previous song in the queue.'),
  
    async execute(interaction) {
      const channel = interaction.member.voice.channel;
  
      if (!channel) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000') 
          .setTitle('Error')
          .setDescription('You need to be in a voice channel to play the previous song.');
          
        return interaction.reply({ embeds: [embed] });
      }
  
      try {
        await interaction.client.playerManager.distube.previous(channel);

        const embed = new EmbedBuilder()
          .setColor('#00FF00') 
          .setTitle('Previous Song')
          .setDescription('⏮ Played the previous song.');
          
        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Previous Song Error:', error);

        const embed = new EmbedBuilder()
          .setColor('#FF0000') 
          .setTitle('Error')
          .setDescription('An error occurred while trying to play the previous song.');
          
        await interaction.reply({ embeds: [embed] });
      }
    },
};

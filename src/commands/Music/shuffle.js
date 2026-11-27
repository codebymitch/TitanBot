const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('shuffle')
      .setDescription('Shuffle the songs in the queue.'),
  
    async execute(interaction) {
      const channel = interaction.member.voice.channel;
  
      if (!channel) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000') 
          .setTitle('Error')
          .setDescription('You need to be in a voice channel to shuffle the queue.');
          
        return interaction.reply({ embeds: [embed] });
      }
  
      try {
        await interaction.client.playerManager.distube.shuffle(channel);

        const embed = new EmbedBuilder()
          .setColor('#00FF00') 
          .setTitle('Queue Shuffled')
          .setDescription('🔀 The queue has been shuffled.');
          
        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Shuffle Error:', error);

        const embed = new EmbedBuilder()
          .setColor('#FF0000') 
          .setTitle('Error')
          .setDescription('An error occurred while shuffling the queue.');
          
        await interaction.reply({ embeds: [embed] });
      }
    },
};

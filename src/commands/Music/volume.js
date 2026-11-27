const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { DisTubeError } = require('distube'); 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the volume for the music playback.')
    .addIntegerOption(option => 
      option.setName('volume')
        .setDescription('Volume level (0-100).')
        .setRequired(true)),
  
  async execute(interaction) {
    const volume = interaction.options.getInteger('volume');
    const channel = interaction.member.voice.channel;
  
    if (!channel) {
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('You need to be in a voice channel to set the volume.');
      
      return interaction.reply({ embeds: [embed] });
    }
  
    if (volume < 0 || volume > 100) {
      const embed = new EmbedBuilder()
        .setColor('#FF0000') 
        .setTitle('Invalid Volume')
        .setDescription('Volume level must be between 0 and 100.');
      
      return interaction.reply({ embeds: [embed] });
    }
  
    try {
      await interaction.client.playerManager.distube.setVolume(channel, volume);
      
      const embed = new EmbedBuilder()
        .setColor('#00FF00') 
        .setTitle('Volume Set')
        .setDescription(`🔊 Volume set to ${volume}%.`);
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Set Volume Error:', error);
      
      let embed;
      
      if (error instanceof DisTubeError) {
        if (error.errorCode === 'NO_QUEUE') {
          embed = new EmbedBuilder()
            .setColor('#FF0000') 
            .setTitle('No Queue')
            .setDescription('There is no queue to set the volume.');
        } else {
          embed = new EmbedBuilder()
            .setColor('#FF0000') 
            .setTitle('Error')
            .setDescription('An error occurred while setting the volume.');
        }
      } else {
        embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Error')
          .setDescription('An error occurred while setting the volume.');
      }
      
      await interaction.reply({ embeds: [embed] });
    }
  },
};

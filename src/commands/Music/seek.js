const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
      .setName('seek')
      .setDescription('Seek to a specific time in the song.')
      .addIntegerOption(option => 
        option.setName('time')
          .setDescription('Time in seconds to seek to.')
          .setRequired(true)),
  
    async execute(interaction) {
      const time = interaction.options.getInteger('time');
      const channel = interaction.member.voice.channel;
  
      if (!channel) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000') 
          .setTitle('Error')
          .setDescription('You need to be in a voice channel to seek the song.');
          
        return interaction.reply({ embeds: [embed] });
      }
  
      try {
        await interaction.client.playerManager.distube.seek(channel, time);

        const embed = new EmbedBuilder()
          .setColor('#00FF00') 
          .setTitle('Seeked')
          .setDescription(`⏩ Seeked to ${time} seconds.`);
          
        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Seek Error:', error);

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Error')
          .setDescription('An error occurred while trying to seek the song.');
          
        await interaction.reply({ embeds: [embed] });
      }
    },
};

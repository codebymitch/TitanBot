const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { DisTubeError } = require('distube');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song.'),

  async execute(interaction) {
    await interaction.deferReply(); // Prevents interaction expiration

    const channel = interaction.member.voice.channel;

    if (!channel) {
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('You need to be in a voice channel to skip the song.');
      
      return interaction.editReply({ embeds: [embed] });
    }

    try {
      const queue = interaction.client.playerManager.distube.getQueue(channel);

      if (!queue || !queue.songs.length) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('No Songs')
          .setDescription('There is no song currently playing in the queue.');
        
        return interaction.editReply({ embeds: [embed] });
      }

      await interaction.client.playerManager.distube.skip(channel);

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Song Skipped')
        .setDescription('⏭ The current song has been skipped.');

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Skip Error:', error);

      let embed;

      if (error instanceof DisTubeError) {
        if (error.errorCode === 'NO_QUEUE') {
          embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('No Queue')
            .setDescription('There is no queue to skip.');
        } else if (error.errorCode === 'NO_UP_NEXT') {
          embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('No Up Next')
            .setDescription('There is no song to skip to next.');
        } else {
          embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('Error')
            .setDescription('An error occurred while trying to skip the song.');
        }
      } else {
        embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Error')
          .setDescription('An error occurred while trying to skip the song.');
      }

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

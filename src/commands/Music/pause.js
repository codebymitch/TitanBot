const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song.'),

  async execute(interaction) {
    const channel = interaction.member.voice.channel;

    
    if (!channel) {
      const noChannelEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('❌ You need to be in a voice channel to pause music.')
        .setTimestamp();

      return interaction.reply({ embeds: [noChannelEmbed], ephemeral: true });
    }

    try {
      const queue = interaction.client.playerManager.distube.getQueue(channel);

     
      if (!queue) {
        const noQueueEmbed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle('Error')
          .setDescription('❌ There is no music playing currently.')
          .setTimestamp();

        return interaction.reply({ embeds: [noQueueEmbed], ephemeral: true });
      }

     
      if (queue.paused) {
        const alreadyPausedEmbed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle('Music Already Paused')
          .setDescription('⏸ The music is already paused.')
          .setTimestamp();

        return interaction.reply({ embeds: [alreadyPausedEmbed], ephemeral: true });
      }

     
      await interaction.client.playerManager.distube.pause(channel);

      const pausedEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Music Paused')
        .setDescription('⏸ The current song has been paused.')
        .setTimestamp();

      await interaction.reply({ embeds: [pausedEmbed] });

    } catch (error) {
      console.error('Pause Error:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('❌ An error occurred while trying to pause the song.')
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused song.'),

  async execute(interaction) {
    const channel = interaction.member.voice.channel;

  
    if (!channel) {
      const noChannelEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('❌ You need to be in a voice channel to resume music.')
        .setTimestamp();

      return interaction.reply({ embeds: [noChannelEmbed], ephemeral: true });
    }

    try {
      const queue = interaction.client.playerManager.distube.getQueue(channel);

     
      if (!queue) {
        const noQueueEmbed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle('Error')
          .setDescription('❌ There is no music currently playing to resume.')
          .setTimestamp();

        return interaction.reply({ embeds: [noQueueEmbed], ephemeral: true });
      }

     
      if (!queue.paused) {
        const alreadyPlayingEmbed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle('Music Already Playing')
          .setDescription('▶️ The music is already playing.')
          .setTimestamp();

        return interaction.reply({ embeds: [alreadyPlayingEmbed], ephemeral: true });
      }

   
      await interaction.client.playerManager.distube.resume(channel);

      const resumedEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Music Resumed')
        .setDescription('▶️ The song has been resumed.')
        .setTimestamp();

      await interaction.reply({ embeds: [resumedEmbed] });

    } catch (error) {
      console.error('Resume Error:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('❌ An error occurred while trying to resume the song.')
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};

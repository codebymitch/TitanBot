const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Get the current queue.'),

  async execute(interaction) {
    const channel = interaction.member.voice.channel;

  
    if (!channel) {
      const noChannelEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('❌ You need to be in a voice channel to get the queue.')
        .setTimestamp();

      return interaction.reply({ embeds: [noChannelEmbed], ephemeral: true });
    }

    try {
      const queue = interaction.client.playerManager.distube.getQueue(channel);

    
      if (!queue || !queue.songs.length) {
        const emptyQueueEmbed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle('Queue')
          .setDescription('The queue is currently empty.')
          .setTimestamp();

        return interaction.reply({ embeds: [emptyQueueEmbed], ephemeral: true });
      }

      const songs = queue.songs;
      const embeds = [];

     
      for (let i = 0; i < songs.length; i += 10) {
        const current = songs.slice(i, i + 10);
        const songList = current.map((song, index) => {
          const isCurrent = i + index === 0; 
          return `${isCurrent ? '** ❤️‍🔥 **' : ''}${i + index + 1}. ${song.name} - \`${song.formattedDuration}\`${isCurrent ? '** (Currently Playing)**' : ''}`;
        }).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('Current Queue')
          .setDescription(songList)
          .setTimestamp();

        embeds.push(embed);
      }

     
      for (const embed of embeds) {
        await interaction.reply({ embeds: [embed] });
      }

    } catch (error) {
      console.error('Get Queue Error:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('❌ An error occurred while retrieving the queue.')
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};

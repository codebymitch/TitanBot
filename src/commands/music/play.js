import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useMainPlayer, QueryType } from 'discord-player';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from Spotify or SoundCloud')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song name, Spotify URL, or SoundCloud URL')
        .setRequired(true)
    ),
  category: 'music',

  async execute(interaction, config, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply({ content: '❌ You must be in a voice channel to play music!' });
    }

    const query = interaction.options.getString('query');
    const player = useMainPlayer();

    try {
      // Detect query type
      let searchEngine = QueryType.AUTO;
      if (query.includes('spotify.com/track')) searchEngine = QueryType.SPOTIFY_SONG;
      else if (query.includes('spotify.com/playlist')) searchEngine = QueryType.SPOTIFY_PLAYLIST;
      else if (query.includes('spotify.com/album')) searchEngine = QueryType.SPOTIFY_ALBUM;
      else if (query.includes('soundcloud.com')) searchEngine = QueryType.SOUNDCLOUD_TRACK;

      const { track } = await player.play(voiceChannel, query, {
        searchEngine,
        nodeOptions: {
          metadata: {
            channel: interaction.channel,
          },
          selfDeaf: true,
          volume: 80,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 30000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 30000,
        },
      });

      const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle('🎵 Added to Queue')
        .setDescription(`**[${track.title}](${track.url})**`)
        .addFields(
          { name: 'Artist', value: track.author || 'Unknown', inline: true },
          { name: 'Duration', value: track.duration || 'Unknown', inline: true },
          { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
        )
        .setThumbnail(track.thumbnail)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Play command error:', error);
      await interaction.editReply({
        content: `❌ Could not find that track. Try:\n• A SoundCloud URL: \`https://soundcloud.com/...\`\n• A Spotify track URL: \`https://open.spotify.com/track/...\`\n• A different search term`,
      });
    }
  },
};

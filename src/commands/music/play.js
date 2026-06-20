import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useMainPlayer, QueryType } from 'discord-player';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from Spotify or search by name')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song name or Spotify URL')
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
      // Detect if it's a Spotify URL or a plain search
      const isSpotifyUrl = query.includes('spotify.com');
      const searchEngine = isSpotifyUrl ? QueryType.SPOTIFY_SONG : QueryType.AUTO;

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
      await interaction.editReply({ content: `❌ Could not play that track. Try using a direct Spotify link or a different search term.` });
    }
  },
};

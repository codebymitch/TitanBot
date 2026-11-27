import { SlashCommandBuilder } from 'discord.js';
import { handlePlay } from '../../services/music/musicActions.js';

export default {
  category: 'Music',
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a track from YouTube or Spotify')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Song name or YouTube / Spotify link')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply().catch(() => {});
    }

    const query =
      interaction.options.getString('query', true) ||
      interaction.options.getString('song', false) ||
      interaction.options.getString('search', false) ||
      '';

    await handlePlay(interaction, query);
  },
};

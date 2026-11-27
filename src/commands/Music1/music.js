import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import {
  playQuery,
  pausePlayback,
  resumePlayback,
  handleSkip,
  handleStop,
  handleQueue,
  seekTrack,
  setVolume,
  setLoopMode,
  setTwentyFourSeven,
  removeFromQueue,
  moveInQueue,
  clearQueue,
  buildNowPlayingReply,
  buildQueueReply,
  replyMusicSuccess,
  replyMusicError,
} from '../../services/music/musicActions.js';

function extractTrackQuery(interaction) {
  const options = interaction.options;
  const candidates = ['query', 'song', 'track', 'search', 'url', 'name', 'input'];

  for (const name of candidates) {
    try {
      const val = options.getString(name);
      if (val && String(val).trim()) {
        return String(val).trim();
      }
    } catch {}
  }

  const firstString = options.data?.find((opt) => typeof opt.value === 'string' && opt.value.trim());
  return firstString ? String(firstString.value).trim() : '';
}

export default {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Control music playback and queue')
    .addSubcommand((sub) =>
      sub
        .setName('play')
        .setDescription('Play a track or search query')
        .addStringOption((opt) =>
          opt
            .setName('query')
            .setDescription('Song name or URL')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('pause')
        .setDescription('Pause the current track')
    )
    .addSubcommand((sub) =>
      sub
        .setName('resume')
        .setDescription('Resume playback')
    )
    .addSubcommand((sub) =>
      sub
        .setName('skip')
        .setDescription('Skip the current track')
    )
    .addSubcommand((sub) =>
      sub
        .setName('stop')
        .setDescription('Stop playback and disconnect')
    )
    .addSubcommand((sub) =>
      sub
        .setName('queue')
        .setDescription('Show the current queue')
    )
    .addSubcommand((sub) =>
      sub
        .setName('nowplaying')
        .setDescription('Show the currently playing track')
    )
    .addSubcommand((sub) =>
      sub
        .setName('seek')
        .setDescription('Seek to a timestamp (e.g. 90 or 1:30)')
        .addStringOption((opt) =>
          opt
            .setName('position')
            .setDescription('Seconds or mm:ss')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('volume')
        .setDescription('Adjust playback volume (0-200)')
        .addIntegerOption((opt) =>
          opt
            .setName('level')
            .setDescription('Volume level from 0 to 200')
            .setMinValue(0)
            .setMaxValue(200)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('loop')
        .setDescription('Toggle or set loop mode')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('on / off')
            .addChoices(
              { name: 'On', value: 'on' },
              { name: 'Off', value: 'off' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('247')
        .setDescription('Toggle 24/7 mode')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('on / off')
            .addChoices(
              { name: 'On', value: 'on' },
              { name: 'Off', value: 'off' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a track from the queue by position')
        .addIntegerOption((opt) =>
          opt
            .setName('position')
            .setDescription('Queue item number starting at 1')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('move')
        .setDescription('Move a track in the queue')
        .addIntegerOption((opt) =>
          opt
            .setName('from')
            .setDescription('Current position')
            .setMinValue(1)
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('to')
            .setDescription('Target position')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Clear all queued tracks')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(false);

    switch (subcommand) {
      case 'play': {
        const query = extractTrackQuery(interaction);
        if (!query) {
          return replyMusicError(interaction, 'Please provide a song name or link.', true);
        }
        return playQuery(interaction, query);
      }

      case 'pause': {
        const ok = pausePlayback(interaction.guildId);
        return ok
          ? replyMusicSuccess(interaction, 'Playback paused.')
          : replyMusicError(interaction, 'Nothing is currently playing to pause.', true);
      }

      case 'resume': {
        const ok = resumePlayback(interaction.guildId);
        return ok
          ? replyMusicSuccess(interaction, 'Playback resumed.')
          : replyMusicError(interaction, 'Playback is not paused.', true);
      }

      case 'skip':
        return handleSkip(interaction);

      case 'stop':
        return handleStop(interaction);

      case 'queue':
        return handleQueue(interaction);

      case 'nowplaying': {
        const payload = buildNowPlayingReply(interaction.guildId);
        if (interaction.deferred || interaction.replied) {
          return interaction.editReply(payload);
        }
        return interaction.reply(payload);
      }

      case 'seek': {
        const pos = interaction.options.getString('position', true);
        const result = seekTrack(interaction.guildId, pos);
        return result !== false
          ? replyMusicSuccess(interaction, `Seek position set to **${result}s**.`)
          : replyMusicError(interaction, 'Invalid seek position or no active track.', true);
      }

      case 'volume': {
        const level = interaction.options.getInteger('level', true);
        const result = setVolume(interaction.guildId, level);
        return result !== false
          ? replyMusicSuccess(interaction, `Volume set to **${result}%**.`)
          : replyMusicError(interaction, 'Could not set volume.', true);
      }

      case 'loop': {
        const mode = interaction.options.getString('mode');
        const enabled = setLoopMode(interaction.guildId, mode);
        return replyMusicSuccess(interaction, `Loop mode is now **${enabled ? 'ON' : 'OFF'}**.`);
      }

      case '247': {
        const mode = interaction.options.getString('mode');
        const enabled = setTwentyFourSeven(interaction.guildId, mode);
        return replyMusicSuccess(interaction, `24/7 mode is now **${enabled ? 'ON' : 'OFF'}**.`);
      }

      case 'remove': {
        const position = interaction.options.getInteger('position', true);
        const removed = removeFromQueue(interaction.guildId, position);
        return removed
          ? replyMusicSuccess(interaction, `Removed **${removed.title}** from the queue.`)
          : replyMusicError(interaction, 'Invalid queue position.', true);
      }

      case 'move': {
        const from = interaction.options.getInteger('from', true);
        const to = interaction.options.getInteger('to', true);
        const moved = moveInQueue(interaction.guildId, from, to);
        return moved
          ? replyMusicSuccess(interaction, `Moved **${moved.title}** to position **${to}**.`)
          : replyMusicError(interaction, 'Invalid queue positions.', true);
      }

      case 'clear': {
        const cleared = clearQueue(interaction.guildId);
        return cleared
          ? replyMusicSuccess(interaction, 'Queue cleared.')
          : replyMusicError(interaction, 'No active queue to clear.', true);
      }

      default:
        return replyMusicError(interaction, 'Unknown music subcommand.', true);
    }
  },
};

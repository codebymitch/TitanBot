import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export const MUSIC_BUTTON_IDS = {
  TOGGLE_PAUSE: 'music_toggle_pause',
  PAUSE: 'music_pause',
  RESUME: 'music_resume',
  SKIP: 'music_skip',
  STOP: 'music_stop',
  QUEUE: 'music_queue',
  LOOP: 'music_loop',
};

function formatSourceLabel(source) {
  const normalized = String(source || '').toLowerCase();
  if (normalized === 'spotify') return 'Spotify';
  return 'YouTube';
}

export function buildNowPlayingEmbed(track, state) {
  const title = track?.title || 'Audio Track';
  const linkUrl = track?.displayUrl || track?.url;
  const description = linkUrl ? `**[${title}](${linkUrl})**` : `**${title}**`;
  const duration = track?.duration || 'Live / Unknown';
  const author = track?.author || 'Unknown';
  const sourceLabel = formatSourceLabel(track?.source);
  const requestedBy = track?.requestedBy ? `${track.requestedBy}` : 'User';
  const queueLeft = `${state?.queue?.length ?? 0}`;
  const loopStatus = state?.loop ? 'On' : 'Off';

  const embed = new EmbedBuilder()
    .setColor(sourceLabel === 'Spotify' ? 0x1db954 : 0xff0000)
    .setTitle(`Now Playing • ${sourceLabel}`)
    .setDescription(description)
    .addFields(
      { name: 'Duration', value: `\`${duration}\``, inline: true },
      { name: 'Author', value: author, inline: true },
      { name: 'Source', value: sourceLabel, inline: true },
      { name: 'Requested By', value: requestedBy, inline: true },
      { name: 'Loop', value: loopStatus, inline: true },
      { name: 'Queue Left', value: `\`${queueLeft}\``, inline: true }
    );

  if (track?.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  return embed;
}

export function buildQueueEmbed(state) {
  const current = state?.currentTrack
    ? `**Current:** [${state.currentTrack.title}](${state.currentTrack.displayUrl || state.currentTrack.url || 'https://youtube.com'}) \`(${state.currentTrack.duration || 'Live / Unknown'})\``
    : '**Current:** None';

  const upcoming = Array.isArray(state?.queue) && state.queue.length > 0
    ? state.queue
        .slice(0, 10)
        .map((item, idx) => `**${idx + 1}.** ${item.title} \`(${item.duration || 'Live / Unknown'})\``)
        .join('\n')
    : 'No upcoming tracks.';

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Music Queue')
    .setDescription(`${current}\n\n**Up Next:**\n${upcoming}`);
}

export function buildMusicErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Music Error')
    .setDescription(message || 'An unexpected music error occurred.');
}

export function buildMusicInfoEmbed(message) {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Music Info')
    .setDescription(message || 'Done.');
}

export function buildPlayerButtonRows(state) {
  const isPaused = state?.player?.state?.status === 'paused';
  const isLooping = Boolean(state?.loop);

  const primaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.TOGGLE_PAUSE)
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.SKIP)
      .setLabel('Skip')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.LOOP)
      .setLabel(isLooping ? 'Loop: On' : 'Loop: Off')
      .setStyle(isLooping ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.STOP)
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger)
  );

  const secondaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
      .setLabel('Queue')
      .setStyle(ButtonStyle.Secondary)
  );

  return [primaryRow, secondaryRow];
}

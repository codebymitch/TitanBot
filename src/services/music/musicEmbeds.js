import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
iimport { EmbedBuilder } from 'discord.js';

export function buildNowPlayingEmbed(track, state) {
  const title = track?.title || 'Audio Track';
  const description = track?.url ? `[${title}](${track.url})` : title;
  const duration = track?.duration || 'Live / Unknown';
  const author = track?.author || 'Unknown';
  const requestedBy = track?.requestedBy ? `${track.requestedBy}` : 'User';
  const queueLeft = `${state?.queue?.length ?? 0}`;

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Now Playing')
    .setDescription(description)
    .addFields(
      { name: 'Duration', value: duration, inline: true },
      { name: 'Author', value: author, inline: true },
      { name: 'Requested By', value: requestedBy, inline: true },
      { name: 'Queue Left', value: queueLeft, inline: true }
    );
}

export function buildQueueEmbed(state) {
  const current = state?.currentTrack
    ? `**Current:** ${state.currentTrack.title} (${state.currentTrack.duration || 'Live / Unknown'})`
    : '**Current:** None';

  const upcoming = Array.isArray(state?.queue) && state.queue.length > 0
    ? state.queue
        .slice(0, 10)
        .map((item, idx) => `${idx + 1}. ${item.title} (${item.duration || 'Live / Unknown'})`)
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

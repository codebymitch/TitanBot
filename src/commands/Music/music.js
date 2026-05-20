import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { useMainPlayer, useQueue, QueueRepeatMode } from 'discord-player';
import { logger } from '../../utils/logger.js';
import { t, pickLanguage } from '../../services/i18n.js';

const LOOP_MAP = {
  off: QueueRepeatMode.OFF,
  track: QueueRepeatMode.TRACK,
  queue: QueueRepeatMode.QUEUE,
  autoplay: QueueRepeatMode.AUTOPLAY,
};

const LOOP_LABEL_KEY = {
  off: 'wolf.music.loopOff',
  track: 'wolf.music.loopTrack',
  queue: 'wolf.music.loopQueue',
  autoplay: 'wolf.music.loopAutoplay',
};

export default {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Reproductor de música — Spotify, YouTube, SoundCloud y más.')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName('play')
        .setDescription('Reproduce o añade a la cola (URL de Spotify/YouTube/SoundCloud o búsqueda).')
        .addStringOption((o) =>
          o.setName('query').setDescription('URL o nombre de la canción/playlist').setRequired(true)))
    .addSubcommand((s) => s.setName('skip').setDescription('Saltar la canción actual.'))
    .addSubcommand((s) => s.setName('queue').setDescription('Ver la cola actual.'))
    .addSubcommand((s) => s.setName('now').setDescription('Qué está sonando ahora.'))
    .addSubcommand((s) => s.setName('pause').setDescription('Pausar la reproducción.'))
    .addSubcommand((s) => s.setName('resume').setDescription('Reanudar la reproducción.'))
    .addSubcommand((s) => s.setName('stop').setDescription('Parar, vaciar la cola y salir del canal.'))
    .addSubcommand((s) => s.setName('shuffle').setDescription('Mezclar la cola.'))
    .addSubcommand((s) =>
      s.setName('loop').setDescription('Configura el modo de repetición.')
        .addStringOption((o) =>
          o.setName('mode').setDescription('Modo de repetición').setRequired(true)
            .addChoices(
              { name: 'Off (sin repetir)', value: 'off' },
              { name: 'Canción actual', value: 'track' },
              { name: 'Cola completa', value: 'queue' },
              { name: 'Autoplay (recomendar)', value: 'autoplay' },
            )))
    .addSubcommand((s) =>
      s.setName('volume').setDescription('Cambia el volumen (0-100).')
        .addIntegerOption((o) =>
          o.setName('level').setDescription('0-100').setMinValue(0).setMaxValue(100).setRequired(true)))
    .addSubcommand((s) =>
      s.setName('remove').setDescription('Quita una canción de la cola por su posición.')
        .addIntegerOption((o) =>
          o.setName('position').setDescription('Posición en la cola (empieza en 1)').setMinValue(1).setRequired(true))),

  async execute(interaction, config, client) {
    const sub = interaction.options.getSubcommand();
    const lang = pickLanguage(config, interaction.guild);

    if (sub === 'play') return handlePlay(interaction, lang);

    const queue = useQueue(interaction.guildId);
    if (!queue) {
      return embed(interaction, 0xf5b942, t(lang, 'wolf.music.nothingTitle'), t(lang, 'wolf.music.nothingDesc'));
    }

    try {
      switch (sub) {
        case 'skip': {
          const track = queue.currentTrack;
          queue.node.skip();
          return embed(
            interaction, 0x7b6cff,
            t(lang, 'wolf.music.skipTitle'),
            track ? t(lang, 'wolf.music.skipped', { title: track.title }) : t(lang, 'wolf.music.skipping'),
          );
        }
        case 'pause': queue.node.pause();  return embed(interaction, 0x7b6cff, t(lang, 'wolf.music.pauseTitle'), t(lang, 'wolf.music.paused'));
        case 'resume': queue.node.resume(); return embed(interaction, 0x7b6cff, t(lang, 'wolf.music.resumeTitle'), t(lang, 'wolf.music.resumed'));
        case 'stop': queue.delete();        return embed(interaction, 0xef4444, t(lang, 'wolf.music.stopTitle'), t(lang, 'wolf.music.stopped'));
        case 'shuffle': {
          const count = queue.tracks.size;
          queue.tracks.shuffle();
          return embed(interaction, 0x7b6cff, t(lang, 'wolf.music.shuffleTitle'), t(lang, 'wolf.music.shuffled', { count }));
        }
        case 'loop': {
          const mode = interaction.options.getString('mode');
          queue.setRepeatMode(LOOP_MAP[mode] ?? QueueRepeatMode.OFF);
          return embed(
            interaction, 0x7b6cff,
            t(lang, 'wolf.music.loopTitle'),
            t(lang, 'wolf.music.loopSet', { mode: t(lang, LOOP_LABEL_KEY[mode] || LOOP_LABEL_KEY.off) }),
          );
        }
        case 'volume': {
          const level = interaction.options.getInteger('level');
          queue.node.setVolume(level);
          return embed(interaction, 0x7b6cff, t(lang, 'wolf.music.volumeTitle'), t(lang, 'wolf.music.volumeSet', { level }));
        }
        case 'now': return handleNow(interaction, queue, lang);
        case 'queue': return handleQueue(interaction, queue, lang);
        case 'remove': {
          const pos = interaction.options.getInteger('position');
          const track = queue.tracks.at(pos - 1);
          if (!track) return embed(interaction, 0xef4444, t(lang, 'wolf.music.positionTitle'), t(lang, 'wolf.music.positionDesc', { pos }));
          queue.removeTrack(pos - 1);
          return embed(interaction, 0x7b6cff, t(lang, 'wolf.music.removed'), t(lang, 'wolf.music.removedDesc', { title: track.title }));
        }
      }
    } catch (err) {
      logger.error('music command error', { sub, error: err?.message });
      return embed(interaction, 0xef4444, 'Error', '```' + String(err?.message || err).slice(0, 500) + '```');
    }
  },
};

async function handlePlay(interaction, lang) {
  const vc = interaction.member?.voice?.channel;
  if (!vc) {
    return embed(interaction, 0xef4444, t(lang, 'wolf.music.notInVc'), t(lang, 'wolf.music.joinFirst'));
  }

  const me = interaction.guild.members.me;
  if (
    vc.joinable === false ||
    !vc.permissionsFor(me)?.has(PermissionFlagsBits.Connect) ||
    !vc.permissionsFor(me)?.has(PermissionFlagsBits.Speak)
  ) {
    return embed(interaction, 0xef4444, t(lang, 'wolf.music.noPerms'), t(lang, 'wolf.music.noPermsDesc', { channel: `${vc}` }));
  }

  const query = interaction.options.getString('query', true);
  await interaction.deferReply();

  try {
    const player = useMainPlayer();
    const result = await player.play(vc, query, {
      nodeOptions: {
        metadata: { channel: interaction.channel, requestedBy: interaction.user, lang },
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 60_000,
        selfDeaf: true,
        volume: 80,
      },
      requestedBy: interaction.user,
    });

    const track = result.track;
    const isPlaylist = Boolean(result.searchResult?.playlist);

    return interaction.editReply({
      embeds: [{
        color: 0x36d6c3,
        title: isPlaylist ? t(lang, 'wolf.music.playlistAdded') : t(lang, 'wolf.music.queued'),
        description: isPlaylist
          ? t(lang, 'wolf.music.playlistAddedDesc', { name: result.searchResult.playlist.title, count: result.searchResult.tracks.length })
          : `[${track.title}](${track.url}) · **${track.author}**`,
        thumbnail: track.thumbnail ? { url: track.thumbnail } : undefined,
      }],
    });
  } catch (err) {
    logger.error('music play error', { error: err?.message });
    return interaction.editReply({
      embeds: [{
        color: 0xef4444,
        title: t(lang, 'wolf.music.cantPlay'),
        description: '```' + String(err?.message || err).slice(0, 700) + '```',
      }],
    });
  }
}

function handleNow(interaction, queue, lang) {
  const track = queue.currentTrack;
  if (!track) return embed(interaction, 0xf5b942, t(lang, 'wolf.music.nothingTitle'), t(lang, 'wolf.music.nothingDesc'));
  let progress = '';
  try { progress = queue.node.createProgressBar(); } catch { /* ignore */ }
  return interaction.reply({
    embeds: [{
      color: 0x7b6cff,
      author: { name: t(lang, 'wolf.music.nowPlayingHeader') },
      title: track.title?.slice(0, 250) || 'Pista',
      url: track.url,
      description: `**${track.author}**${progress ? `\n\n${progress}` : ''}`,
      thumbnail: track.thumbnail ? { url: track.thumbnail } : undefined,
      footer: { text: t(lang, 'wolf.music.nowPlayingFooter', { user: track.requestedBy?.tag || 'anonymous' }) },
    }],
  });
}

function handleQueue(interaction, queue, lang) {
  const current = queue.currentTrack;
  const upcoming = queue.tracks.toArray().slice(0, 10);
  const lines = upcoming.map(
    (t2, i) => `\`${String(i + 1).padStart(2, ' ')}.\` [${t2.title.slice(0, 70)}](${t2.url}) · **${t2.author}**`,
  );
  const more = queue.tracks.size > 10 ? `\n\n${t(lang, 'wolf.music.queueMore', { n: queue.tracks.size - 10 })}` : '';
  return interaction.reply({
    embeds: [{
      color: 0x7b6cff,
      title: t(lang, 'wolf.music.queueTitle'),
      description:
        (current ? `${t(lang, 'wolf.music.queueNowPlaying', { title: current.title, url: current.url })}\n\n` : '') +
        (lines.length ? lines.join('\n') : t(lang, 'wolf.music.queueEmpty')) +
        more,
      footer: { text: t(lang, 'wolf.music.queueFooter', { n: queue.tracks.size }) },
    }],
  });
}

function embed(interaction, color, title, description) {
  const payload = { embeds: [{ color, title, description }] };
  if (interaction.deferred) return interaction.editReply(payload);
  return interaction.reply(payload);
}

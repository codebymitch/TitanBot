import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  startGame,
  stopGame,
  getSession,
  getUserScore,
  getLeaderboard,
  getCategoryChoices,
  getDifficultyChoices,
  isKnownCategory,
  DEFAULT_ROUND_SECONDS,
  MIN_ROUND_SECONDS,
  MAX_ROUND_SECONDS,
} from '../../services/tebakGambarService.js';

const ACTION_ALIASES = {
  start: 'start', mulai: 'start', play: 'start', new: 'start',
  stop: 'stop', end: 'stop', halt: 'stop', berhenti: 'stop',
  skor: 'skor', score: 'skor', scoreku: 'skor',
  leaderboard: 'leaderboard', lb: 'leaderboard', top: 'leaderboard', rank: 'leaderboard', papan: 'leaderboard',
};

function resolveAction(raw) {
  if (!raw) return 'start';
  return ACTION_ALIASES[String(raw).toLowerCase()] || null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('tebakgambar')
    .setDescription('Main tebak gambar bareng member lain langsung di channel ini.')
    .addStringOption((option) =>
      option
        .setName('aksi')
        .setDescription('Pilih aksi (default: mulai permainan)')
        .setRequired(false)
        .addChoices(
          { name: 'Mulai', value: 'start' },
          { name: 'Stop', value: 'stop' },
          { name: 'Skor', value: 'skor' },
          { name: 'Leaderboard', value: 'leaderboard' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('kategori')
        .setDescription('Filter kategori gambar (default: Campuran)')
        .setRequired(false)
        .addChoices(...getCategoryChoices()),
    )
    .addStringOption((option) =>
      option
        .setName('kesulitan')
        .setDescription('Filter tingkat kesulitan (default: semua)')
        .setRequired(false)
        .addChoices(...getDifficultyChoices()),
    )
    .addIntegerOption((option) =>
      option
        .setName('durasi')
        .setDescription(`Waktu per ronde dalam detik (${MIN_ROUND_SECONDS}-${MAX_ROUND_SECONDS}, default ${DEFAULT_ROUND_SECONDS})`)
        .setRequired(false)
        .setMinValue(MIN_ROUND_SECONDS)
        .setMaxValue(MAX_ROUND_SECONDS),
    ),
  category: 'Fun',
  abuseProtection: { maxAttempts: 15, windowMs: 60_000 },

  async execute(interaction) {
    const client = interaction.client;

    if (!interaction.guildId) {
      return replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message: 'Perintah ini hanya bisa dipakai di dalam server.',
      });
    }

    let action = resolveAction(interaction.options.getString('aksi'));
    let category = interaction.options.getString('kategori');
    let difficulty = interaction.options.getString('kesulitan');
    let duration = interaction.options.getInteger('durasi');

    // Dukungan prefix: argumen pertama bisa berupa kategori, kesulitan, atau angka durasi.
    const rawAction = interaction.options.getString('aksi');
    if (!action && rawAction) {
      if (isKnownCategory(rawAction)) {
        category = category || rawAction;
        action = 'start';
      } else if (/^\d+$/.test(rawAction)) {
        duration = duration || Number(rawAction);
        action = 'start';
      } else {
        difficulty = difficulty || rawAction;
        action = 'start';
      }
    }

    try {
      if (action === 'start') {
        const result = await startGame(client, {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          hostId: interaction.user.id,
          category: category || 'Campuran',
          difficulty: difficulty || null,
          durationSec: duration || DEFAULT_ROUND_SECONDS,
          deliverFirstRound: async (payload) => {
            await InteractionHelper.safeReply(interaction, payload);
            return interaction.fetchReply();
          },
        });

        if (!result.started) {
          const reason = result.reason === 'already_running'
            ? `Sudah ada permainan tebak gambar yang berjalan di <#${result.channelId}>. Hentikan dulu dengan \`/tebakgambar aksi:stop\`.`
            : 'Tidak ada gambar yang tersedia untuk dimainkan saat ini.';
          return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: reason });
        }

        logger.debug(`Tebak gambar started in guild ${interaction.guildId} by ${interaction.user.id}`);
        return;
      }

      if (action === 'stop') {
        const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
          || interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
        const session = getSession(interaction.guildId);

        if (!session?.active) {
          await InteractionHelper.safeDefer(interaction);
          return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: 'Tebak Gambar', description: 'Tidak ada permainan yang sedang berjalan.', color: 'secondary' })],
          });
        }

        const isHost = session.hostId === interaction.user.id;
        if (!isHost && !isManager) {
          await InteractionHelper.safeDefer(interaction);
          return replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Hanya yang memulai permainan atau admin yang bisa menghentikannya.',
          });
        }

        await InteractionHelper.safeDefer(interaction);
        await stopGame(client, interaction.guildId, { userId: interaction.user.id, force: isManager });
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({ title: 'Tebak Gambar Berhenti', description: 'Permainan tebak gambar sudah dihentikan.', color: 'success' })],
        });
      }

      if (action === 'skor') {
        await InteractionHelper.safeDefer(interaction);
        const score = await getUserScore(client, interaction.guildId, interaction.user.id);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Skor Tebak Gambar Kamu',
              description: `Poin: **${score.points}**\nJawaban benar: **${score.correct}**`,
              color: 'blurple',
            }),
          ],
        });
      }

      if (action === 'leaderboard') {
        await InteractionHelper.safeDefer(interaction);
        const rows = await getLeaderboard(client, interaction.guildId, 10);
        const description = rows.length === 0
          ? 'Belum ada yang mencetak skor. Jadilah yang pertama!'
          : rows
              .map((row, index) => {
                const member = interaction.guild?.members?.cache?.get(row.userId);
                const name = member ? member.user.username : `<@${row.userId}>`;
                return `**${index + 1}.** ${name} — **${row.points}** poin (${row.correct} benar)`;
              })
              .join('\n');

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Leaderboard Tebak Gambar',
              description,
              color: 'blurple',
            }),
          ],
        });
      }

      return replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message: 'Aksi tidak dikenal. Gunakan salah satu: start, stop, skor, leaderboard.',
      });
    } catch (error) {
      logger.error('Tebak gambar command error:', error);
      throw error;
    }
  },
};

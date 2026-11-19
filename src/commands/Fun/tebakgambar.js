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
  getModeChoices,
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
    .setDescription('Play guess the picture with other members right in this channel.')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Pick an action (default: start the game)')
        .setRequired(false)
        .addChoices(
          { name: 'Start', value: 'start' },
          { name: 'Stop', value: 'stop' },
          { name: 'Score', value: 'skor' },
          { name: 'Leaderboard', value: 'leaderboard' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Filter the image category (default: Mixed)')
        .setRequired(false)
        .addChoices(...getCategoryChoices()),
    )
    .addStringOption((option) =>
      option
        .setName('difficulty')
        .setDescription('Filter the difficulty level (default: all)')
        .setRequired(false)
        .addChoices(...getDifficultyChoices()),
    )
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('How the image is shown: full (classic) or a small zoomed-in detail')
        .setRequired(false)
        .addChoices(...getModeChoices()),
    )
    .addIntegerOption((option) =>
      option
        .setName('duration')
        .setDescription(`Time per round in seconds (${MIN_ROUND_SECONDS}-${MAX_ROUND_SECONDS}, default ${DEFAULT_ROUND_SECONDS})`)
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
        message: 'This command can only be used inside a server.',
      });
    }

    let action = resolveAction(interaction.options.getString('action'));
    let category = interaction.options.getString('category');
    let difficulty = interaction.options.getString('difficulty');
    let duration = interaction.options.getInteger('duration');
    const mode = interaction.options.getString('mode');

    // Dukungan prefix: argumen pertama bisa berupa kategori, kesulitan, atau angka durasi.
    const rawAction = interaction.options.getString('action');
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
        await InteractionHelper.safeDefer(interaction);
        const result = await startGame(client, {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          hostId: interaction.user.id,
          category: category || 'Mixed',
          difficulty: difficulty || null,
          durationSec: duration || DEFAULT_ROUND_SECONDS,
          mode: mode || undefined,
          deliverFirstRound: async (payload) => {
            await InteractionHelper.safeReply(interaction, payload);
            return interaction.fetchReply();
          },
        });

        if (!result.started) {
          const reason = result.reason === 'already_running'
            ? `There's already a guess-the-picture game running in <#${result.channelId}>. Stop it first with \`/tebakgambar action:stop\`.`
            : 'No images are available to play right now.';
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
            embeds: [createEmbed({ title: 'Guess the Picture', description: 'No game is currently running.', color: 'secondary' })],
          });
        }

        const isHost = session.hostId === interaction.user.id;
        if (!isHost && !isManager) {
          await InteractionHelper.safeDefer(interaction);
          return replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Only the person who started the game or an admin can stop it.',
          });
        }

        await InteractionHelper.safeDefer(interaction);
        await stopGame(client, interaction.guildId, { userId: interaction.user.id, force: isManager });
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({ title: 'Guess the Picture Stopped', description: 'The guess-the-picture game has been stopped.', color: 'success' })],
        });
      }

      if (action === 'skor') {
        await InteractionHelper.safeDefer(interaction);
        const score = await getUserScore(client, interaction.guildId, interaction.user.id);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Your Guess the Picture Score',
              description: `Points: **${score.points}**\nCorrect answers: **${score.correct}**`,
              color: 'blurple',
            }),
          ],
        });
      }

      if (action === 'leaderboard') {
        await InteractionHelper.safeDefer(interaction);
        const rows = await getLeaderboard(client, interaction.guildId, 10);
        const description = rows.length === 0
          ? 'No one has scored yet. Be the first!'
          : rows
              .map((row, index) => {
                const member = interaction.guild?.members?.cache?.get(row.userId);
                const name = member ? member.user.username : `<@${row.userId}>`;
                return `**${index + 1}.** ${name} — **${row.points}** points (${row.correct} correct)`;
              })
              .join('\n');

        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Guess the Picture Leaderboard',
              description,
              color: 'blurple',
            }),
          ],
        });
      }

      return replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message: 'Unknown action. Use one of: Start, Stop, Score, Leaderboard.',
      });
    } catch (error) {
      logger.error('Tebak gambar command error:', error);
      throw error;
    }
  },
};

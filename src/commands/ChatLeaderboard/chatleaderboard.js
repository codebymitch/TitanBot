import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { configureChatLeaderboard } from '../../services/chatLeaderboardService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('chatleaderboard')
    .setDescription('Set up an auto-updating all-time chat message leaderboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('leaderboard')
        .setDescription('Set up or disable the live Top Chat board')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel for the board; leave empty to disable it')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))),

  async execute(interaction, guildConfig, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message: 'Kamu perlu izin **Manage Server** untuk mengatur leaderboard chat.',
      });
      return;
    }

    await InteractionHelper.safeDefer(interaction);
    try {
      const channel = interaction.options.getChannel('channel');
      const result = await configureChatLeaderboard(client, interaction.guild, channel);
      const embed = new EmbedBuilder()
        .setColor(result.enabled ? 0xA753D2 : 0xE0A52B)
        .setTitle(result.enabled ? 'Live Top Chat aktif' : 'Live Top Chat dimatikan')
        .setDescription(
          result.enabled
            ? `Board dipasang di <#${result.channelId}>. Pesan dihitung mulai sekarang dan board diperbarui tiap 5 menit.`
            : 'Board chat live dan tracking pesan sudah dimatikan.',
        );
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('chatleaderboard command error:', error);
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Ada masalah saat mengatur leaderboard chat.',
      });
    }
  },
};

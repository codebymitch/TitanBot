import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { configureChatLeaderboard } from '../../services/chatLeaderboardService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('chatleaderboard')
    .setDescription('Set up an all-time chat message leaderboard that updates automatically')
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
        message: 'You need the **Manage Server** permission to configure the chat leaderboard.',
      });
      return;
    }

    await InteractionHelper.safeDefer(interaction);
    try {
      const channel = interaction.options.getChannel('channel');
      const result = await configureChatLeaderboard(client, interaction.guild, channel);
      const embed = new EmbedBuilder()
        .setColor(result.enabled ? 0xA753D2 : 0xE0A52B)
        .setTitle(result.enabled ? 'Live Top Chat enabled' : 'Live Top Chat disabled')
        .setDescription(
          result.enabled
            ? `Board set up in <#${result.channelId}>. Messages are counted from now on and the board updates every 5 minutes.`
            : 'The live chat board and message tracking have been disabled.',
        );
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('chatleaderboard command error:', error);
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Something went wrong while configuring the chat leaderboard.',
      });
    }
  },
};

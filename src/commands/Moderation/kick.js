import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { t, pickLanguage } from '../../services/i18n.js';

export default {
    data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("The user to kick")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for the kick"),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  category: "moderation",

  async execute(interaction, config, client) {
    const lang = pickLanguage(config, interaction.guild);
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        throw new TitanBotError("User lacks permission", ErrorTypes.PERMISSION, t(lang, 'wolf.cmd.mod.kick.permDenied'));
      }

      const targetUser = interaction.options.getUser("target");
      const member = interaction.options.getMember("target");
      const reason = interaction.options.getString("reason") || t(lang, 'wolf.cmd.mod.common.noReason');

      if (targetUser.id === interaction.user.id) {
        throw new TitanBotError("Cannot kick self", ErrorTypes.VALIDATION, t(lang, 'wolf.cmd.mod.common.cantSelf'));
      }
      if (targetUser.id === client.user.id) {
        throw new TitanBotError("Cannot kick bot", ErrorTypes.VALIDATION, t(lang, 'wolf.cmd.mod.common.cantBot'));
      }
      if (!member) {
        throw new TitanBotError("Target not found", ErrorTypes.USER_INPUT, t(lang, 'wolf.cmd.mod.common.targetNotFound'), { subtype: 'user_not_found' });
      }
      if (interaction.member.roles.highest.position <= member.roles.highest.position) {
        throw new TitanBotError("Cannot kick user", ErrorTypes.PERMISSION, t(lang, 'wolf.cmd.mod.common.higherRole'));
      }
      if (!member.kickable) {
        throw new TitanBotError("Bot cannot kick", ErrorTypes.PERMISSION, t(lang, 'wolf.cmd.mod.common.botCannot'));
      }

      
      await member.kick(reason);

      
      const caseId = await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: "Member Kicked",
          target: `${targetUser.tag} (${targetUser.id})`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason,
          metadata: {
            userId: targetUser.id,
            moderatorId: interaction.user.id
          }
        }
      });

      
      await InteractionHelper.universalReply(interaction, {
        embeds: [
          successEmbed(
            t(lang, 'wolf.cmd.mod.kick.successTitle', { user: targetUser.tag }),
            `${t(lang, 'wolf.cmd.mod.common.reasonLabel')} ${reason}\n${t(lang, 'wolf.cmd.mod.common.caseLabel')}${caseId}`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Kick command error:', error);
      const errorEmbed_default = errorEmbed(
        t(lang, 'wolf.cmd.mod.common.unexpectedError'),
        error.userMessage || error.message || t(lang, 'wolf.cmd.mod.kick.unexpectedError')
      );
      await InteractionHelper.universalReply(interaction, { embeds: [errorEmbed_default] });
    }
  }
};




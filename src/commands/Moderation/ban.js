import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { t, pickLanguage } from '../../services/i18n.js';
export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to ban")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the ban"),
        )
.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const lang = pickLanguage(config, interaction.guild);
        try {
            const user = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || t(lang, 'wolf.cmd.mod.common.noReason');

            if (user.id === interaction.user.id) {
                throw new Error(t(lang, 'wolf.cmd.mod.common.cantSelf'));
            }
            if (user.id === client.user.id) {
                throw new Error(t(lang, 'wolf.cmd.mod.common.cantBot'));
            }

            const result = await ModerationService.banUser({
                guild: interaction.guild,
                user,
                moderator: interaction.member,
                reason
            });

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        t(lang, 'wolf.cmd.mod.ban.successTitle', { user: user.tag }),
                        `${t(lang, 'wolf.cmd.mod.common.reasonLabel')} ${reason}\n${t(lang, 'wolf.cmd.mod.common.caseLabel')}${result.caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Ban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'ban_failed' });
        }
    },
};




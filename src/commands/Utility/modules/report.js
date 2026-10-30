import { createEmbed } from '../../../utils/embeds.js';
import { NO_REASON } from '../../../utils/moderationCard.js';
import { sendReport, REPORT_CHANNEL_ID } from '../../../services/reportChannelService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            logger.warn('Report interaction defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason')?.trim() || NO_REASON;
        const guildId = interaction.guildId;

        const sent = await sendReport(interaction.guild, {
            reporter: interaction.user,
            reportedUser: targetUser,
            reason,
            sourceChannel: interaction.channel,
        }).catch((error) => {
            logger.error('Failed to send report:', error);
            return false;
        });

        if (!sent) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Could not send the report. Post it directly in <#${REPORT_CHANNEL_ID}>.` });
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: 'Report Submitted',
                description: `Your report against **${targetUser.tag}** has been successfully filed and sent to the moderation team. Thank you!`,
            })],
        });

        logger.info('Report submitted', {
            userId: interaction.user.id,
            reportedUserId: targetUser.id,
            guildId,
            reasonLength: reason.length,
        });
    },
};

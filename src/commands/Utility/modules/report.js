import { createEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { logEvent, EVENT_TYPES, resolveLogChannel } from '../../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../../utils/logEmbeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            logger.warn('Report interaction defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const guildId = interaction.guildId;

        const guildConfig = await getGuildConfig(client, guildId);
        const reportChannelId = resolveLogChannel(guildConfig, 'reports');

        if (!reportChannelId) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'The report channel has not been set up. Ask a moderator to use `/logging dashboard` or `/logging channel`.' });
        }

        try {
            const ownerMention = interaction.guild.ownerId
                ? `<@${interaction.guild.ownerId}> New report!`
                : 'New report!';

            await logEvent({
                client,
                guildId,
                eventType: EVENT_TYPES.REPORT_FILE,
                content: ownerMention,
                data: {
                    title: 'User Report',
                    lines: [
                        formatLogLine('Reported User', `${targetUser.tag} (\`${targetUser.id}\`)`),
                        formatLogLine('Reported By', `${interaction.user.tag} (\`${interaction.user.id}\`)`),
                        formatLogLine('Channel', interaction.channel.toString()),
                    ],
                    blockFields: [{ name: 'Reason', value: reason }],
                    author: await resolveUserAuthor(client, targetUser.id),
                    thumbnail: targetUser.displayAvatarURL(),
                },
            });

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
        } catch (error) {
            logger.error('report error:', error);
            await handleInteractionError(interaction, error, { commandName: 'report', source: 'report' });
        }
    },
};

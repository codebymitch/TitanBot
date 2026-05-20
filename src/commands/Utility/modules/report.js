import { getColor } from '../../../config/bot.js';
import { createEmbed, errorEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { t } from '../../../services/i18n.js';

export default {
    async execute(interaction, config, client, lang) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            logger.warn('Report interaction defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const guildId = interaction.guildId;

        const guildConfig = await getGuildConfig(client, guildId);
        const reportChannelId = guildConfig.reportChannelId;

        if (!reportChannelId) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.utility.report.setupRequired'),
                    t(lang, 'wolf.cmd.utility.report.setupRequiredDesc')
                )],
            });
        }

        const reportChannel = interaction.guild.channels.cache.get(reportChannelId);
        if (!reportChannel) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.utility.report.channelMissingTitle'),
                    t(lang, 'wolf.cmd.utility.report.channelMissingDesc')
                )],
            });
        }

        try {
            const reportEmbed = createEmbed({
                title: t(lang, 'wolf.cmd.utility.report.reportEmbedTitle', { tag: targetUser.tag }),
                description: t(lang, 'wolf.cmd.utility.report.reportEmbedDesc', {
                    reporterTag: interaction.user.tag,
                    reporterId: interaction.user.id,
                    targetTag: targetUser.tag,
                    targetId: targetUser.id,
                }),
            })
                .setColor(getColor('error'))
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: t(lang, 'wolf.cmd.utility.report.fieldReason'), value: reason },
                    { name: t(lang, 'wolf.cmd.utility.report.fieldChannel'), value: interaction.channel.toString(), inline: true },
                    { name: t(lang, 'wolf.cmd.utility.report.fieldTime'), value: new Date().toUTCString(), inline: true },
                );

            await reportChannel.send({
                content: `<@&${interaction.guild.ownerId}> ${t(lang, 'wolf.cmd.utility.report.staffPing')}`,
                embeds: [reportEmbed],
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: t(lang, 'wolf.cmd.utility.report.submittedTitle'),
                    description: t(lang, 'wolf.cmd.utility.report.submittedDesc', { tag: targetUser.tag })
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

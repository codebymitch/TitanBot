import { createEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { logEvent, EVENT_TYPES, resolveLogChannel } from '../../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../../utils/logging/logEmbeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import type { SubcommandModule } from '../../../types/index.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            logger.warn('Report interaction defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
            return;
        }

        const targetUser = interaction.options.getUser('user')!;
        const reason = interaction.options.getString('reason')!;
        const guildId = interaction.guildId!;

        const guildConfig = await getGuildConfig(client, guildId);
        const reportChannelId = resolveLogChannel(guildConfig, 'reports');

        if (!reportChannelId) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Der Meldekanal ist noch nicht eingerichtet. Bitte einen Moderator, `/logging dashboard` oder `/logging channel` zu nutzen.' });
        }

        const ownerMention = interaction.guild!.ownerId
            ? `<@${interaction.guild!.ownerId}> Neue Meldung!`
            : 'Neue Meldung!';

        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.REPORT_FILE,
            content: ownerMention,
            data: {
                title: 'Nutzermeldung',
                lines: [
                    formatLogLine('Gemeldeter Nutzer', `${targetUser.tag} (\`${targetUser.id}\`)`),
                    formatLogLine('Gemeldet von', `${interaction.user.tag} (\`${interaction.user.id}\`)`),
                    formatLogLine('Kanal', interaction.channel!.toString()),
                ],
                blockFields: [{ name: 'Grund', value: reason }],
                author: await resolveUserAuthor(client, targetUser.id),
                thumbnail: targetUser.displayAvatarURL(),
            },
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: 'Meldung gesendet',
                description: `Deine Meldung gegen **${targetUser.tag}** wurde an das Moderationsteam gesendet. Danke!`,
            })],
        });

        logger.info('Report submitted', {
            userId: interaction.user.id,
            reportedUserId: targetUser.id,
            guildId,
            reasonLength: reason.length,
        });
    },
} satisfies SubcommandModule;

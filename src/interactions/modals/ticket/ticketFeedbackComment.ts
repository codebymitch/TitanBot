import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { ColorResolvable } from 'discord.js';
import type { ModalHandler } from '../../../types/index.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

function buildEmbed(title: string, description: string, color: ColorResolvable): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
}

export default {
    name: 'ticket_feedback_comment_modal',

    async execute(interaction, client, args) {
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Ungültiges Feedback',
                    'Dieses Feedback-Formular scheint fehlerhaft zu sein.',
                    getColor('error'),
                )],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const comment = interaction.fields.getTextInputValue('feedback_comment')?.trim();
        if (!comment) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Leeres Feedback',
                    'Bitte gib einen Kommentar ein, bevor du dein Feedback absendest.',
                    getColor('warning'),
                )],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedbackComment: failed to load ticket data', { guildId, channelId, error: err instanceof Error ? err.message : String(err) });
        }

        if (!ticketData) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Ticket nicht gefunden',
                    'Das Ticket zu diesem Feedback wurde nicht gefunden.',
                    getColor('error'),
                )],
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildEmbed(
                    '❌ Nicht erlaubt',
                    'Nur wer das Ticket erstellt hat, kann dafür Feedback abgeben.',
                    getColor('error'),
                )],
            });
            return;
        }

        ticketData.feedback = {
            ...ticketData.feedback,
            comment,
            commentSubmittedAt: new Date().toISOString(),
        };

        try {
            await saveTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedbackComment: failed to save feedback', { guildId, channelId, error: err instanceof Error ? err.message : String(err) });
        }

        try {
            await logTicketFeedback({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketChannelId: channelId,
                userId: interaction.user.id,
                rating: ticketData.feedback?.rating ?? null,
                comment,
            });
        } catch (err) {
            logger.warn('ticketFeedbackComment: failed to send log', { guildId, channelId, error: err instanceof Error ? err.message : String(err) });
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [buildEmbed(
                '✅ Feedback abgesendet',
                'Dein schriftliches Feedback wurde gespeichert. Danke, dass du uns hilfst, besser zu werden!',
                getColor('success'),
            )],
        });

        logger.info('Ticket feedback comment submitted', {
            guildId,
            channelId,
            userId: interaction.user.id,
        });
    },
} satisfies ModalHandler;

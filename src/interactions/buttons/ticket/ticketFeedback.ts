import { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { ButtonHandler } from '../../../types/index.js';

const STAR_LABELS: Record<string, string> = {
    '1': '⭐ 1 — Schlecht',
    '2': '⭐ 2 — Unterdurchschnittlich',
    '3': '⭐ 3 — Durchschnittlich',
    '4': '⭐ 4 — Gut',
    '5': '⭐ 5 — Ausgezeichnet',
};

const feedbackHandler = {
    name: 'ticket_feedback',

    async execute(interaction, client, args) {
        
        const [guildId, channelId, ratingStr] = args;

        if (!guildId || !channelId || !ratingStr) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ungültiger Feedback-Link')
                        .setDescription('Dieser Feedback-Link scheint fehlerhaft zu sein.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        try {
            await interaction.deferUpdate();
        } catch (err) {
            logger.warn('ticketFeedback: interaction expired before deferUpdate', { guildId, channelId, error: err instanceof Error ? err.message : String(err) });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedback: failed to load ticket data', { guildId, channelId, error: err instanceof Error ? err.message : String(err) });
        }

        if (!ticketData) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ticket nicht gefunden')
                        .setDescription('Das Ticket zu dieser Umfrage wurde nicht gefunden.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Nicht erlaubt')
                        .setDescription('Nur wer das Ticket erstellt hat, kann dafür Feedback abgeben.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (ticketData.feedback?.rating) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Bereits abgegeben')
                        .setDescription(`Du hast dieses Ticket bereits mit **${STAR_LABELS[String(ticketData.feedback.rating)]}** bewertet.\nDanke für dein Feedback!`)
                        .setColor(getColor('success')),
                ],
                components: [],
            });
            return;
        }

        const rating = parseInt(ratingStr, 10);
        const ratingLabel = STAR_LABELS[String(rating)] ?? `${rating} Sterne`;

        try {
            ticketData.feedback = {
                rating,
                submittedAt: new Date().toISOString(),
            };
            await saveTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedback: failed to save feedback', { guildId, channelId, rating, error: err instanceof Error ? err.message : String(err) });
        }

        try {
            await logTicketFeedback({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketChannelId: channelId,
                userId: interaction.user.id,
                rating,
            });
        } catch (err) {
            logger.warn('ticketFeedback: failed to send log', { guildId, channelId, error: err instanceof Error ? err.message : String(err) });
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ Danke für dein Feedback!')
                    .setDescription(`Du hast deine Support-Erfahrung mit **${ratingLabel}** bewertet.\n\nDein Feedback wurde gespeichert und hilft uns, besser zu werden!`)
                    .setColor(getColor('success'))
                    .setFooter({ text: 'Danke, dass du unseren Support genutzt hast.' })
                    .setTimestamp(),
            ],
            components: [],
        });

        logger.info('Ticket feedback submitted', {
            guildId,
            channelId,
            userId: interaction.user.id,
            rating,
        });
    },
} satisfies ButtonHandler;

const commentHandler = {
    name: 'ticket_feedback_comment',

    async execute(interaction, client, args) {
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ungültiger Feedback-Link')
                        .setDescription('Diese Feedback-Aktion scheint fehlerhaft zu sein.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_feedback_comment_modal:${guildId}:${channelId}`)
            .setTitle('Ticket-Feedback abgeben');

        const commentInput = new TextInputBuilder()
            .setCustomId('feedback_comment')
            .setLabel('Dein Feedback')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Was lief gut, was können wir besser machen?')
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(commentInput));

        await interaction.showModal(modal);
    },
} satisfies ButtonHandler;

const declineHandler = {
    name: 'ticket_feedback_decline',

    async execute(interaction) {
        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('👋 Kein Problem!')
                    .setDescription('Du kannst dich jederzeit wieder melden, wenn du weitere Hilfe brauchst.')
                    .setColor(getColor('default')),
            ],
            components: [],
        });
    },
} satisfies ButtonHandler;

export default [feedbackHandler, commentHandler, declineHandler];
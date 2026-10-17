import { EmbedBuilder } from 'discord.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';
import type { SelectMenuHandler } from '../../../types/index.js';

const STAR_LABELS: Record<string, string> = {
    '1': '⭐ 1 — Schlecht',
    '2': '⭐ 2 — Unterdurchschnittlich',
    '3': '⭐ 3 — Durchschnittlich',
    '4': '⭐ 4 — Gut',
    '5': '⭐ 5 — Ausgezeichnet',
};

export default {
    name: 'ticket_feedback',

    async execute(interaction, client, args) {
        
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.update({
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

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedback: failed to load ticket data', { guildId, channelId, error: err instanceof Error ? err.message : String(err) });
        }

        if (!ticketData) {
            await interaction.update({
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
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Nicht erlaubt')
                        .setDescription('Nur wer das Ticket erstellt hat, kann dafür Feedback abgeben.')
                        .setColor(getColor('error')),
                ],
                ephemeral: true,
            });
            return;
        }

        if (ticketData.feedback?.rating) {
            await interaction.update({
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

        const rating = parseInt(interaction.values[0], 10);
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

        const thankYouEmbed = new EmbedBuilder()
            .setTitle('✅ Danke für dein Feedback!')
            .setDescription(`Du hast deine Support-Erfahrung mit **${ratingLabel}** bewertet.\n\nDein Feedback wurde gespeichert und hilft uns, besser zu werden!`)
            .setColor(getColor('success'))
            .setFooter({ text: 'Danke, dass du unseren Support genutzt hast.' })
            .setTimestamp();

        await interaction.update({
            embeds: [thankYouEmbed],
            components: [],
        });

        logger.info('Ticket feedback submitted', {
            guildId,
            channelId,
            userId: interaction.user.id,
            rating,
        });
    },
} satisfies SelectMenuHandler;
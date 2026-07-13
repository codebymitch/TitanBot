import { EmbedBuilder } from 'discord.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';

const STAR_LABELS = {
    '1': '⭐ 1 — Poor',
    '2': '⭐ 2 — Below Average',
    '3': '⭐ 3 — Average',
    '4': '⭐ 4 — Good',
    '5': '⭐ 5 — Excellent',
};

export default {
    name: 'ticket_feedback',

    async execute(interaction, client, args) {
        
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Invalid Feedback Link')
                        .setDescription('This feedback link appears to be malformed.')
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
            logger.warn('ticketFeedback: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ticket Not Found')
                        .setDescription('Could not find the ticket associated with this survey.')
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
                        .setTitle('❌ Not Allowed')
                        .setDescription('Only the ticket creator can submit feedback for this ticket.')
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
                        .setTitle('✅ Already Submitted')
                        .setDescription(`You already rated this ticket **${STAR_LABELS[String(ticketData.feedback.rating)]}**.\nThank you for your feedback!`)
                        .setColor(getColor('success')),
                ],
                components: [],
            });
            return;
        }

        const rating = parseInt(interaction.values[0], 10);
        const ratingLabel = STAR_LABELS[String(rating)] ?? `${rating} stars`;

        try {
            ticketData.feedback = {
                rating,
                submittedAt: new Date().toISOString(),
            };
            await saveTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedback: failed to save feedback', { guildId, channelId, rating, error: err.message });
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
            logger.warn('ticketFeedback: failed to send log', { guildId, channelId, error: err.message });
        }

        const thankYouEmbed = new EmbedBuilder()
            .setTitle('✅ Thanks for your feedback!')
            .setDescription(`You rated your support experience **${ratingLabel}**.\n\nYour feedback has been recorded and helps us improve!`)
            .setColor(getColor('success'))
            .setFooter({ text: 'Thank you for using our support system.' })
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
};
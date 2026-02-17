import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        try {
            // Ensure interaction is deferred before proceeding
            if (!interaction.deferred && !interaction.replied) {
                const deferred = await InteractionHelper.safeDefer(interaction);
                if (!deferred) {
                    return;
                }
            }

            const user = interaction.options.getUser('user');
            const guildId = interaction.guild.id;

            const guildConfig = await getGuildConfig(client, guildId);
            const maxTickets = guildConfig.maxTicketsPerUser || 3;

            const ticketChannels = interaction.guild.channels.cache.filter(
                channel => channel.name.startsWith('ticket-') && 
                channel.topic && 
                channel.topic.includes(user.id)
            );

            const openTicketCount = ticketChannels.size;

            const embed = infoEmbed(
                `🎫 Ticket Limit Check: ${user.tag}`,
                `**Open Tickets:** ${openTicketCount}/${maxTickets}\n` +
                `**Remaining:** ${Math.max(0, maxTickets - openTicketCount)}\n\n` +
                (openTicketCount >= maxTickets 
                    ? '⚠️ This user has reached their ticket limit.' 
                    : '✅ This user can create more tickets.')
            );

            await interaction.editReply({ embeds: [embed] });
            
            logger.info('Ticket limit check completed', {
                userId: interaction.user.id,
                targetUserId: user.id,
                targetUserTag: user.tag,
                guildId: guildId,
                openTickets: openTicketCount,
                maxTickets: maxTickets,
                commandName: 'ticket_limits_check'
            });
        } catch (error) {
            logger.error('Error checking ticket limits', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                commandName: 'ticket_limits_check'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'ticket_limits_check',
                source: 'ticket_limits_module'
            });
        }
    }
};




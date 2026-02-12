import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

export default {
    async execute(interaction, config, client) {
        const user = interaction.options.getUser('user');
        const guildId = interaction.guild.id;

        try {
            const guildConfig = await getGuildConfig(client, guildId);
            const maxTickets = guildConfig.maxTicketsPerUser || 3;

            const ticketChannels = interaction.guild.channels.cache.filter(
                channel => channel.name.startsWith('ticket-') && 
                channel.topic && 
                channel.topic.includes(user.id)
            );

            const openTicketCount = ticketChannels.size;

            const embed = infoEmbed(
                `ðŸŽ« Ticket Limit Check: ${user.tag}`,
                `**Open Tickets:** ${openTicketCount}/${maxTickets}\n` +
                `**Remaining:** ${Math.max(0, maxTickets - openTicketCount)}\n\n` +
                (openTicketCount >= maxTickets 
                    ? 'âš ï¸ This user has reached their ticket limit.' 
                    : 'âœ… This user can create more tickets.')
            );

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error checking ticket limits:', error);
            throw new Error('Failed to check ticket limits. Please try again.');
        }
    }
};


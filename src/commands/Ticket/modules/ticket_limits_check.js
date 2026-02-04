import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';

export default {
    async execute(interaction, config, client) {
        const guildId = interaction.guildId;
        const targetUser = interaction.options.getUser("user");
        
        try {
            // Get guild config for max tickets
            const { getGuildConfig } = await import('../../../services/guildConfig.js');
            const guildConfig = await getGuildConfig(client, guildId);
            const maxTicketsPerUser = guildConfig.maxTicketsPerUser || 3;
            
            // Get user's current ticket count
            const { getUserTicketCount } = await import('../../../services/ticket.js');
            const currentTicketCount = await getUserTicketCount(guildId, targetUser.id);
            const remainingTickets = maxTicketsPerUser - currentTicketCount;

            const status = currentTicketCount >= maxTicketsPerUser ? "🔴 Limit Reached" : 
                           currentTicketCount >= maxTicketsPerUser * 0.8 ? "🟡 Near Limit" : "🟢 Available";

            return interaction.editReply({
                embeds: [
                    infoEmbed(
                        `🎫 ${targetUser.tag}'s Ticket Status`,
                        `**Current Tickets:** ${currentTicketCount}/${maxTicketsPerUser}\n` +
                        `**Remaining Tickets:** ${remainingTickets}\n` +
                        `**Status:** ${status}\n\n` +
                        `**User ID:** ${targetUser.id}`
                    )
                ]
            });
        } catch (error) {
            console.error("Error in ticket limits check:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while checking user's ticket status."
                    )
                ]
            });
        }
    }
};

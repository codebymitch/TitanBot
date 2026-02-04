import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';

export default {
    async execute(interaction, config, client) {
        const guildId = interaction.guildId;
        const newMaxTickets = interaction.options.getInteger("max_tickets");
        
        try {
            // Get current config
            const { getGuildConfig } = await import('../../../services/guildConfig.js');
            const currentConfig = await getGuildConfig(client, guildId);
            const previousLimit = currentConfig.maxTicketsPerUser || 3;
            
            // Update the configuration
            currentConfig.maxTicketsPerUser = newMaxTickets;
            
            // Save the updated configuration using the proper guild config key
            const { getGuildConfigKey } = await import('../../../utils/database.js');
            const configKey = getGuildConfigKey(guildId);
            await client.db.set(configKey, currentConfig);
            console.log(`[DB] Updated maxTicketsPerUser to ${newMaxTickets} for guild ${guildId}`);

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "🎫 Ticket Limit Updated",
                        `Maximum tickets per user has been set to **${newMaxTickets}**.\n\n` +
                        `**Updated by:** ${interaction.user.tag}\n` +
                        `**Previous limit:** ${previousLimit}`
                    )
                ]
            });
        } catch (error) {
            console.error("Error in ticket limits set:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while updating ticket limits."
                    )
                ]
            });
        }
    }
};

import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getGuildConfigKey } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        const maxTickets = interaction.options.getInteger('max_tickets');
        const guildId = interaction.guild.id;

        try {
            const guildConfig = await getGuildConfig(client, guildId);
            
            guildConfig.maxTicketsPerUser = maxTickets;

            const configKey = getGuildConfigKey(guildId);
            await client.db.set(configKey, guildConfig);

            const embed = successEmbed(
                '✅ Ticket Limit Updated',
                `Maximum tickets per user has been set to **${maxTickets}**.\n\n` +
                `Users will now be limited to ${maxTickets} open ticket${maxTickets !== 1 ? 's' : ''} at a time.`
            );

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error setting ticket limits:', error);
            throw new Error('Failed to update ticket limits. Please try again.');
        }
    }
};




import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getGuildConfigKey } from '../../../utils/database.js';
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

            const maxTickets = interaction.options.getInteger('max_tickets');
            const guildId = interaction.guild.id;

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
            
            logger.info('Ticket limit updated', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                guildId: guildId,
                maxTickets: maxTickets,
                commandName: 'ticket_limits_set'
            });
        } catch (error) {
            logger.error('Error setting ticket limits', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                commandName: 'ticket_limits_set'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'ticket_limits_set',
                source: 'ticket_limits_module'
            });
        }
    }
};




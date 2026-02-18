import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getGuildConfigKey } from '../../../utils/database.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        try {
            
            if (!interaction.deferred && !interaction.replied) {
                const deferred = await InteractionHelper.safeDefer(interaction);
                if (!deferred) {
                    return;
                }
            }

            const guildId = interaction.guild.id;

            const guildConfig = await getGuildConfig(client, guildId);
            
            const currentSetting = guildConfig.dmOnClose !== false;
            guildConfig.dmOnClose = !currentSetting;

            const configKey = getGuildConfigKey(guildId);
            await client.db.set(configKey, guildConfig);

            const embed = successEmbed(
                '✅ DM Notification Setting Updated',
                `DM notifications when tickets are closed: **${guildConfig.dmOnClose ? 'Enabled' : 'Disabled'}**\n\n` +
                (guildConfig.dmOnClose 
                    ? '📬 Users will receive a DM when their ticket is closed.' 
                    : '📭 Users will NOT receive a DM when their ticket is closed.')
            );

            await interaction.editReply({ embeds: [embed] });
            
            logger.info('Ticket DM notification setting toggled', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                guildId: guildId,
                dmOnClose: guildConfig.dmOnClose,
                commandName: 'ticket_limits_toggle_dm'
            });
        } catch (error) {
            logger.error('Error toggling DM setting', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                commandName: 'ticket_limits_toggle_dm'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'ticket_limits_toggle_dm',
                source: 'ticket_limits_module'
            });
        }
    }
};





import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getGuildConfigKey } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        const guildId = interaction.guild.id;

        try {
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
        } catch (error) {
            console.error('Error toggling DM setting:', error);
            throw new Error('Failed to toggle DM setting. Please try again.');
        }
    }
};

import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';

export default {
    async execute(interaction, config, client) {
        const guildId = interaction.guildId;
        
        try {
            // Get current config
            const { getGuildConfig } = await import('../../../services/guildConfig.js');
            const currentConfig = await getGuildConfig(client, guildId);
            const currentDMSetting = currentConfig.dmOnClose !== false; // Default to true
            const newDMSetting = !currentDMSetting;
            
            // Update the configuration
            currentConfig.dmOnClose = newDMSetting;
            
            // Save the updated configuration using the proper guild config key
            const { getGuildConfigKey } = await import('../../../utils/database.js');
            const configKey = getGuildConfigKey(guildId);
            await client.db.set(configKey, currentConfig);
            console.log(`[DB] Updated dmOnClose to ${newDMSetting} for guild ${guildId}`);

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "🎫 DM Setting Updated",
                        `DM notifications on ticket close have been **${newDMSetting ? 'ENABLED' : 'DISABLED'}**.\n\n` +
                        `**Updated by:** ${interaction.user.tag}\n` +
                        `**Previous setting:** ${currentDMSetting ? 'Enabled' : 'Disabled'}`
                    )
                ]
            });
        } catch (error) {
            console.error("Error in ticket limits toggle dm:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while updating DM settings."
                    )
                ]
            });
        }
    }
};

import { MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import {
    WELCOME_CONFIG_ACTIONS,
    buildWelcomeConfigModal,
    buildWelcomeConfigPayload,
    hasWelcomeSetup
} from '../../commands/Welcome/modules/welcomeConfig.js';

export default {
    name: 'welcome_config',
    async execute(interaction, client, args) {
        const action = args[0];

        if (!WELCOME_CONFIG_ACTIONS.includes(action)) {
            await interaction.reply({
                embeds: [errorEmbed('Invalid Option', 'That welcome config action is not supported.')],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const config = await getWelcomeConfig(client, interaction.guildId);
        if (!hasWelcomeSetup(config)) {
            await interaction.reply({
                embeds: [errorEmbed('No Welcome Setup Found', 'Set up welcome first using **/welcome setup**.')],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (action === 'ping') {
            const newPingValue = !Boolean(config.welcomePing);
            await updateWelcomeConfig(client, interaction.guildId, { welcomePing: newPingValue });

            const updatedConfig = await getWelcomeConfig(client, interaction.guildId);
            await interaction.update(
                buildWelcomeConfigPayload(
                    interaction.guild,
                    updatedConfig,
                    `Ping setting updated: ${newPingValue ? 'Enabled' : 'Disabled'}.`
                )
            );

            logger.info(`[Welcome Config] Ping toggled to ${newPingValue} in guild ${interaction.guildId}`);
            return;
        }

        const modal = buildWelcomeConfigModal(action, config);
        if (!modal) {
            await interaction.reply({
                embeds: [errorEmbed('Config Action Failed', 'Unable to open the selected config form.')],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.showModal(modal);
    }
};
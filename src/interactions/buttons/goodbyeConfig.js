import { MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import {
    GOODBYE_CONFIG_ACTIONS,
    buildGoodbyeConfigModal,
    buildGoodbyeConfigPayload,
    hasGoodbyeSetup
} from '../../commands/Welcome/modules/goodbyeConfig.js';

export default {
    name: 'goodbye_config',
    async execute(interaction, client, args) {
        const action = args[0];

        if (!GOODBYE_CONFIG_ACTIONS.includes(action)) {
            await interaction.reply({
                embeds: [errorEmbed('Invalid Option', 'That goodbye config action is not supported.')],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const config = await getWelcomeConfig(client, interaction.guildId);
        if (!hasGoodbyeSetup(config)) {
            await interaction.reply({
                embeds: [errorEmbed('No Goodbye Setup Found', 'Set up goodbye first using **/goodbye setup**.')],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (action === 'ping') {
            const newPingValue = !Boolean(config.goodbyePing);
            await updateWelcomeConfig(client, interaction.guildId, { goodbyePing: newPingValue });

            const updatedConfig = await getWelcomeConfig(client, interaction.guildId);
            await interaction.update(
                buildGoodbyeConfigPayload(
                    interaction.guild,
                    updatedConfig,
                    `Ping setting updated: ${newPingValue ? 'Enabled' : 'Disabled'}.`
                )
            );

            logger.info(`[Goodbye Config] Ping toggled to ${newPingValue} in guild ${interaction.guildId}`);
            return;
        }

        const modal = buildGoodbyeConfigModal(action, config);
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
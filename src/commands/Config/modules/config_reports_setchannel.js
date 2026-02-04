import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: ["Ephemeral"] }); // Only staff sees the reply
        if (!deferSuccess) return;

        const channel = interaction.options.getChannel("channel");
        const guildId = interaction.guildId;

        try {
            // 1. Fetch current guild configuration
            let guildConfig = await getGuildConfig(client, guildId);

            // 2. Update the configuration object
            guildConfig.reportChannelId = channel.id;

            // 3. Save the updated configuration
            await setGuildConfig(client, guildId, guildConfig);

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "✅ Report Channel Set!",
                        `All new reports will now be sent to ${channel}.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Error setting report channel:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Database Error",
                        "Could not save the channel configuration. Check bot permissions.",
                    ),
                ],
            });
        }
    }
};

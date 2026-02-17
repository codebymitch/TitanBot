import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
export default {
    async execute(interaction, config, client) {
        const channel = interaction.options.getChannel("channel");
        const guildId = interaction.guildId;

        try {
            let guildConfig = await getGuildConfig(client, guildId);

            guildConfig.reportChannelId = channel.id;

            await setGuildConfig(client, guildId, guildConfig);

            await interaction.reply({
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




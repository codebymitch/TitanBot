import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Config/setreportchannel.js
export default {
    data: new SlashCommandBuilder()
        .setName("setreportchannel")
        .setDescription("Sets the channel where user reports will be sent.")
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("The text channel to send reports to.")
                .addChannelTypes(ChannelType.GuildText) // Only allow standard text channels
                .setRequired(true),
        )
        // 💡 Requires MANAGE_CHANNELS permission to run
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .setDMPermission(false),
    category: "Moderation",

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {object} config
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true }); // Only staff sees the reply

        const channel = interaction.options.getChannel("channel");
        const guildId = interaction.guildId;
        const configKey = getGuildConfigKey(guildId);

        try {
            // 1. Fetch current guild configuration
            let guildConfig = await client.db.get(configKey, {});

            // 2. Update the configuration object
            guildConfig.reportChannelId = channel.id;

            // 3. Save the updated configuration to the database
            await client.db.set(configKey, guildConfig);

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
    },
};

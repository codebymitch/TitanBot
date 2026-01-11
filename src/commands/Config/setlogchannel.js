import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Config/setlogchannel.js
export default {
    data: new SlashCommandBuilder()
        .setName("setlogchannel")
        .setDescription(
            "Sets the channel where bot moderation and audit logs are sent.",
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("The text channel to use for logging.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
        )
        .addBooleanOption((option) =>
            option
                .setName("disable")
                .setDescription("Set to True to disable logging completely.")
                .setRequired(false),
        ),
    category: "config",

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {object} config // NOTE: This 'config' might be stale, we use getGuildConfig
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        if (
            !interaction.member.permissions.has(
                PermissionsBitField.Flags.Administrator,
            )
        ) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need Administrator permissions.",
                    ),
                ],
            });
        }

        if (!client.db) {
            return interaction.editReply({
                embeds: [
                    errorEmbed("Database Error", "Database not initialized."),
                ],
            });
        }

        const guildId = interaction.guildId;
        // 🔑 1. Define the correct key for storage
        const configKey = getGuildConfigKey(guildId);

        // 🔑 2. Fetch the current config using the correct key helper
        const currentConfig = await getGuildConfig(client, guildId);

        const logChannel = interaction.options.getChannel("channel");
        const disableLogging = interaction.options.getBoolean("disable");

        try {
            if (disableLogging) {
                currentConfig.logChannelId = null;
                // 🔑 3. Use the correct key to save
                await client.db.set(configKey, currentConfig);

                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "Logging Disabled 🚫",
                            "Server logging has been disabled.",
                        ),
                    ],
                });
            }

            const permissionsInChannel = logChannel.permissionsFor(
                interaction.guild.members.me,
            );
            if (
                !permissionsInChannel.has(
                    PermissionsBitField.Flags.SendMessages,
                ) ||
                !permissionsInChannel.has(PermissionsBitField.Flags.EmbedLinks)
            ) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Bot Permission Error",
                            `I need Send Messages and Embed Links permissions in ${logChannel}.`,
                        ),
                    ],
                });
            }

            // Update local config object
            currentConfig.logChannelId = logChannel.id;

            // 🔑 4. Use the correct key to save the updated config
            await client.db.set(configKey, currentConfig);

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "Log Channel Set 📝",
                        `Logs will be sent to ${logChannel}.`,
                    ),
                ],
            });

            // Log the action using the newly updated config
            logEvent(
                client,
                guildId,
                successEmbed(
                    "Log Channel Activated",
                    `Logging set by ${interaction.user}.`,
                ).setColor("#3498DB"),
                currentConfig,
            );
        } catch (error) {
            console.error("Error setting log channel:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Configuration Error",
                        "Could not save configuration.",
                    ),
                ],
            });
        }
    },
};


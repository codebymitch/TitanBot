import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';
import { logEvent } from '../../utils/moderation.js';

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

        // 🔑 1. Fetch the current config using guildConfig service
        const currentConfig = await getGuildConfig(client, guildId);

        const logChannel = interaction.options.getChannel("channel");
        const disableLogging = interaction.options.getBoolean("disable");

        try {
            if (disableLogging) {
                currentConfig.logChannelId = null;
                currentConfig.enableLogging = false;
                // 🔑 2. Save using guildConfig service
                await setGuildConfig(client, guildId, currentConfig);

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
            currentConfig.enableLogging = true;

            // 🔑 4. Save using guildConfig service
            await setGuildConfig(client, guildId, currentConfig);

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "Log Channel Set 📝",
                        `Logs will be sent to ${logChannel}.`,
                    ),
                ],
            });

            // Log the action using the newly updated config
            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Log Channel Activated",
                    target: logChannel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Logging set by ${interaction.user}`,
                    metadata: {
                        channelId: logChannel.id,
                        moderatorId: interaction.user.id,
                        loggingEnabled: true
                    }
                }
            });
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


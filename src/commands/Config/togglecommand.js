import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Config/togglecommand.js
export default {
    data: new SlashCommandBuilder()
        .setName("togglecommand")
        .setDescription("Enable or disable a slash command for this server.")
        .addStringOption((option) =>
            option
                .setName("command")
                .setDescription("The name of the command to toggle")
                .setRequired(true),
        )
        .addBooleanOption((option) =>
            option
                .setName("enable")
                .setDescription("Set to 'true' to enable, 'false' to disable.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: "utility",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        if (
            !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
        ) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need Manage Server permissions.",
                    ),
                ],
            });
        }

        const commandName = interaction.options
            .getString("command")
            .toLowerCase();
        const shouldEnable = interaction.options.getBoolean("enable");
        const action = shouldEnable ? "enabled" : "disabled";

        if (!client.commands.has(commandName)) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Command Not Found",
                        `The command \`/${commandName}\` does not exist.`,
                    ),
                ],
            });
        }

        if (commandName === "togglecommand") {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Action Denied",
                        "You cannot disable the toggle command.",
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

        try {
            const guildId = interaction.guildId;

            const currentConfig = await getGuildConfig(client, guildId);

            if (!currentConfig.enabledCommands) {
                currentConfig.enabledCommands = {};
            }

            console.log(
            );
            // -------------------------

            if (currentConfig.enabledCommands[commandName] === shouldEnable) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "No Change",
                            `Command is already ${action}.`,
                        ),
                    ],
                });
            }

            // Update Config
            currentConfig.enabledCommands[commandName] = shouldEnable;

            // Save to DB
            await client.db.set(guildId, currentConfig);

            // Log
            const toggleEmbed = createEmbed(
                "⚙️ Command Toggled",
                `The command \`/${commandName}\` has been **${action}** by ${interaction.user}.`,
            )
                .setColor(shouldEnable ? "#2ECC71" : "#E74C3C")
                .addFields(
                    {
                        name: "Command",
                        value: `\`/${commandName}\``,
                        inline: true,
                    },
                    {
                        name: "Status",
                        value: shouldEnable ? "Enabled ✅" : "Disabled ❌",
                        inline: true,
                    },
                );

            // 🔑 UPDATE: Pass the currentConfig, the channel ID, and the user ID
            logEvent(
                client,
                interaction.guildId,
                toggleEmbed,
                currentConfig, // Configuration object (for log channel ID)
                interaction.channelId, // The channel where the command was executed (for filtering)
                interaction.user.id, // The user who executed the command (for filtering)
            );

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        `Command ${action}!`,
                        `The command \`/${commandName}\` is now **${action}** for this server.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Toggle Command Error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Error",
                        "An error occurred accessing the database.",
                    ),
                ],
            });
        }
    },
};

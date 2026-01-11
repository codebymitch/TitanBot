import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Config/logfilter.js
export default {
    data: new SlashCommandBuilder()
        .setName("logfilter")
        .setDescription(
            "Adds or removes users/channels from the log ignore list.",
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Adds a user or channel to the ignore list.")
                .addStringOption((option) =>
                    option
                        .setName("type")
                        .setDescription("The type of entity to ignore.")
                        .setRequired(true)
                        .addChoices(
                            { name: "User", value: "user" },
                            { name: "Channel", value: "channel" },
                        ),
                )
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription(
                            "The ID of the User or Channel to ignore.",
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription(
                    "Removes a user or channel from the ignore list.",
                )
                .addStringOption((option) =>
                    option
                        .setName("type")
                        .setDescription("The type of entity to stop ignoring.")
                        .setRequired(true)
                        .addChoices(
                            { name: "User", value: "user" },
                            { name: "Channel", value: "channel" },
                        ),
                )
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription(
                            "The ID of the User or Channel to remove from the ignore list.",
                        )
                        .setRequired(true),
                ),
        ),
    category: "config",

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
                        "You need Administrator permissions to manage log filters.",
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

        const subcommand = interaction.options.getSubcommand();
        const type = interaction.options.getString("type");
        const entityId = interaction.options.getString("id");
        const guildId = interaction.guildId;

        // Use the current config (which is guaranteed to have logIgnore)
        const currentConfig = config;

        // Determine which array to modify
        let targetArray;
        let entityName = "";
        let entityType = "";

        if (type === "user") {
            targetArray = currentConfig.logIgnore.users;
            entityType = "User";
            const member = await interaction.guild.members
                .fetch(entityId)
                .catch(() => null);
            entityName = member ? member.user.tag : `ID: ${entityId}`;
        } else if (type === "channel") {
            targetArray = currentConfig.logIgnore.channels;
            entityType = "Channel";
            const channel = interaction.guild.channels.cache.get(entityId);
            entityName = channel ? `#${channel.name}` : `ID: ${entityId}`;
        } else {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Invalid Type",
                        "Please choose 'user' or 'channel'.",
                    ),
                ],
            });
        }

        let successMessage = "";

        if (subcommand === "add") {
            if (targetArray.includes(entityId)) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Already Filtered",
                            `${entityType} **${entityName}** is already on the ignore list.`,
                        ),
                    ],
                });
            }
            targetArray.push(entityId);
            successMessage = `${entityType} **${entityName}** has been added to the log ignore list. Events originating from them will not be logged.`;
        } else if (subcommand === "remove") {
            const index = targetArray.indexOf(entityId);
            if (index === -1) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Not Filtered",
                            `${entityType} **${entityName}** was not found on the ignore list.`,
                        ),
                    ],
                });
            }
            targetArray.splice(index, 1);
            successMessage = `${entityType} **${entityName}** has been removed from the log ignore list. Events will now be logged.`;
        }

        try {
            await client.db.set(guildId, currentConfig);

            const logEmbed = successEmbed(
                "Log Filter Updated",
                successMessage,
            ).addFields(
                {
                    name: "Action",
                    value:
                        subcommand.charAt(0).toUpperCase() +
                        subcommand.slice(1),
                    inline: true,
                },
                { name: "Entity Type", value: entityType, inline: true },
            );

            // Log the filter change
            logEvent(
                client,
                guildId,
                logEmbed,
                currentConfig,
                interaction.channelId,
                interaction.user.id,
            );

            await interaction.editReply({
                embeds: [successEmbed("Success!", successMessage)],
            });
        } catch (error) {
            console.error("Error saving log filter:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Database Error",
                        "Failed to save configuration change.",
                    ),
                ],
            });
        }
    },
};

import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logEvent } from '../../../utils/moderation.js';

export default {
    async execute(interaction, config, client) {
if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
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

        const currentConfig = config;

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
            const { getGuildConfigKey } = await import('../../../utils/database.js');
            const configKey = getGuildConfigKey(guildId);
            await client.db.set(configKey, currentConfig);

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

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Log Filter Updated",
                    target: `Filter ${subcommand}`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        entityType,
                        loggingEnabled: currentConfig.enableLogging
                    }
                }
            });

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
    }
};

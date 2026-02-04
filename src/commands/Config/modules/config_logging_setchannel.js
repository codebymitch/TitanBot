import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { logEvent } from '../../../utils/moderation.js';
import { validateLogChannel } from '../../../utils/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: ["Ephemeral"] });
        if (!deferSuccess) return;

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
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
        const ticketLifecycle = interaction.options.getChannel("ticket_lifecycle");
        const ticketTranscript = interaction.options.getChannel("ticket_transcript");

        try {
            // Handle ticket lifecycle channel
            if (ticketLifecycle) {
                const validation = validateLogChannel(ticketLifecycle, interaction.guild.members.me);
                if (!validation.valid) {
                    return interaction.editReply({
                        embeds: [errorEmbed("Invalid Channel", validation.error)],
                    });
                }

                if (!currentConfig.ticketLogging) {
                    currentConfig.ticketLogging = {};
                }
                currentConfig.ticketLogging.lifecycleChannelId = ticketLifecycle.id;
                await setGuildConfig(client, guildId, currentConfig);

                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "🎫 Ticket Lifecycle Channel Set",
                            `**Channel:** ${ticketLifecycle}\n**Logs:** Ticket open, close, delete, claim, unclaim, and priority events\n\n**Updated by:** ${interaction.user.tag}`
                        ),
                    ],
                });
            }

            // Handle ticket transcript channel
            if (ticketTranscript) {
                const validation = validateLogChannel(ticketTranscript, interaction.guild.members.me);
                if (!validation.valid) {
                    return interaction.editReply({
                        embeds: [errorEmbed("Invalid Channel", validation.error)],
                    });
                }

                if (!currentConfig.ticketLogging) {
                    currentConfig.ticketLogging = {};
                }
                currentConfig.ticketLogging.transcriptChannelId = ticketTranscript.id;
                await setGuildConfig(client, guildId, currentConfig);

                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "📜 Ticket Transcript Channel Set",
                            `**Channel:** ${ticketTranscript}\n**Logs:** Ticket transcript generation\n\n**Updated by:** ${interaction.user.tag}`
                        ),
                    ],
                });
            }

            // Handle main logging channel (original functionality)
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

            // Handle main logging channel setup
            if (logChannel) {
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
                return;
            }

            // No option provided
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "No Option Provided",
                        "Please provide one of the following: channel, ticket_lifecycle, ticket_transcript, or disable."
                    ),
                ],
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
    }
};

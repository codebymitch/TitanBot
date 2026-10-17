import type { Command } from '../../types/index.js';
import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type GuildMember, type TextChannel } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes, type ErrorLike } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Verwaltet das Ticket-System des Servers.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Richtet das Ticket-Panel in einem bestimmten Kanal ein.",
                )
                .addChannelOption((option) =>
                    option
.setName("panel_channel")
                        .setDescription(
                            "Der Kanal, in den das Ticket-Panel gesendet wird.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "Die Hauptnachricht/Beschreibung für das Ticket-Panel.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "Beschriftung des Buttons zum Erstellen (Standard: Ticket erstellen)",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "Die Kategorie, in der neue Tickets erstellt werden (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "Die Kategorie, in die geschlossene Tickets verschoben werden (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "Die Rolle, die Zugriff auf Tickets hat (optional).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximale Anzahl an Tickets pro Nutzer (Standard: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Nutzer per DM informieren, wenn das Ticket geschlossen wird (Standard: true)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Das interaktive Ticket-Dashboard öffnen"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !(interaction.member as GuildMember).permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Ticket command permission denied', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst für diese Aktion die Berechtigung „Kanäle verwalten“.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId!);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Auf diesem Server ist bereits ein Ticket-System eingerichtet (Panel in <#${existingConfig.ticketPanelChannelId}>).\n\nPro Server wird nur ein Ticket-System unterstützt. Nutze \`/ticket dashboard\`, um die Einrichtung zu bearbeiten, oder wähl im Dashboard **System löschen**, um neu zu starten.` });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel") as TextChannel;
            const categoryChannel = interaction.options.getChannel("category");
            const closedCategoryChannel = interaction.options.getChannel("closed_category");
            const staffRole = interaction.options.getRole("staff_role");
const panelMessage = interaction.options.getString("panel_message") || "Klick auf den Button unten, um ein Support-Ticket zu erstellen.";
            const buttonLabel =
                interaction.options.getString("button_label") ||
"Ticket erstellen";
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

            const setupEmbed = createEmbed({ 
                title: "Support-Tickets", 
description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
.setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;
                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                    currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.info('Ticket configuration saved', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                    });
                } else {
                    logger.error('Ticket setup: database unavailable, panel sent but configuration was NOT saved', {
                        guildId: interaction.guildId,
                    });
                }

                let successMessage = `Das Ticket-Panel wurde in ${panelChannel} gesendet.`;
                
                if (categoryChannel) {
                    successMessage += ` Neue Tickets werden in der Kategorie **${categoryChannel.name}** erstellt.`;
                } else {
                    successMessage += ' Neue Tickets werden in einer neuen Kategorie „Tickets“ erstellt.';
                }
                
                if (closedCategoryChannel) {
                    successMessage += ` Geschlossene Tickets werden nach **${closedCategoryChannel.name}** verschoben.`;
                }
                
                if (staffRole) {
                    successMessage += ` Die Rolle **${staffRole.name}** hat Zugriff auf Tickets.`;
                }
                
                successMessage += `\n\n**Max. Tickets pro Nutzer:** ${maxTicketsPerUser}\n**DM beim Schließen:** ${dmOnClose ? 'Aktiviert' : 'Deaktiviert'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Ticket-Panel eingerichtet",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Ticket panel setup completed', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnClose: dmOnClose,
                    commandName: 'ticket_setup'
                });

                const logEmbed = createEmbed({
                    title: "Einrichtung des Ticket-Systems (Konfigurations-Log)",
                    description: `Das Ticket-Panel wurde von ${interaction.user} in ${panelChannel} eingerichtet.`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "Panel-Kanal",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "Ticket-Kategorie",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "Keine angegeben.",
                            inline: true,
                        },
                        {
                            name: "Kategorie für geschlossene Tickets",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "Keine angegeben.",
                            inline: true,
                        },
                        {
                            name: "Team-Rolle",
                            value: staffRole
                                ? staffRole.toString()
                                : "Keine angegeben.",
                            inline: true,
                        },
                        {
                            name: "Max. Tickets pro Nutzer",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "DM beim Schließen",
                            value: dmOnClose ? 'Aktiviert' : 'Deaktiviert',
                            inline: true,
                        },
                        {
                            name: "Moderator",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (error) {
                logger.error('Ticket setup error', {
                    error: (error as ErrorLike).message,
                    stack: (error as ErrorLike).stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Das Ticket-Panel konnte nicht gesendet oder die Konfiguration nicht gespeichert werden. Prüf die Berechtigungen des Bots (vor allem Nachrichten senden im Zielkanal) und die Datenbankverbindung.' }).catch(err => {
                        logger.error('Failed to send error reply', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionError(interaction, error, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
} satisfies Command;
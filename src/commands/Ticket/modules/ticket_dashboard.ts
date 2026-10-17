import type { Command, GuildConfig, NexoClient, SubcommandModule } from '../../../types/index.js';
import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    UserSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    type ButtonInteraction,
    type CategoryChannel,
    type ChatInputCommandInteraction,
    type Guild,
    type GuildTextBasedChannel,
    type StringSelectMenuInteraction,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes, replyUserError, type ErrorLike } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getGuildTicketStats, type GuildTicketStats } from '../../../utils/database/tickets.js';
import { getUserTicketCount } from '../../../services/ticket.js';
import {
    getTicketPanelStatus,
    messageHasButtonCustomId,
    formatPanelStatusField,
    type PanelStatus,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

function buildButtonRow(guildConfig: GuildConfig, guildId: string, disabled = false, panelStatus: PanelStatus | null = null) {
    const dmEnabled = guildConfig.dmOnClose !== false;
    const showRepost = panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const buttons: ButtonBuilder[] = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`ticket_cfg_repost_${guildId}`)
                .setLabel('Panel neu posten')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_dm_toggle_${guildId}`)
            .setLabel('DM beim Schließen')
            .setStyle(dmEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji(dmEnabled ? '📬' : '📭')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_staff_role_btn_${guildId}`)
            .setLabel('Team-Rolle')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🛡️')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_delete_${guildId}`)
            .setLabel('System löschen')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

async function persistPanelMessageId(client: NexoClient, guildId: string, guildConfig: GuildConfig, messageId: string | null | undefined) {
    if (!messageId || guildConfig.ticketPanelMessageId === messageId) return;
    guildConfig.ticketPanelMessageId = messageId;
    if (client.db) {
        await setGuildConfig(client, guildId, guildConfig);
    }
}

function buildPanelEmbed(config: GuildConfig) {
    return new EmbedBuilder()
        .setTitle('Support-Tickets')
        .setDescription(config.ticketPanelMessage || 'Klick auf den Button unten, um ein Support-Ticket zu erstellen.')
        .setColor(getColor('info'));
}

function buildPanelButtonRow(config: GuildConfig) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel(config.ticketButtonLabel || 'Ticket erstellen')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩'),
    );
}

async function repostTicketPanel(client: NexoClient, guild: Guild, guildConfig: GuildConfig, guildId: string) {
    const channel = await guild.channels.fetch(guildConfig.ticketPanelChannelId!).catch(() => null) as GuildTextBasedChannel | null;
    if (!channel) {
        throw new NexoBotError(
            'Panel channel missing',
            ErrorTypes.CONFIGURATION,
            'Der eingestellte Ticket-Panel-Kanal existiert nicht mehr. Leg im Dashboard einen neuen Panel-Kanal fest.',
        );
    }

    const sentPanel = await channel.send({
        embeds: [buildPanelEmbed(guildConfig)],
        components: [buildPanelButtonRow(guildConfig)],
    });

    await persistPanelMessageId(client, guildId, guildConfig, sentPanel.id);
    return sentPanel;
}

function formatCloseDuration(ms: number | null | undefined) {
    if (ms == null) return '`–`';
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function buildDashboardEmbed(config: GuildConfig, guild: Guild, panelStatus: PanelStatus | null = null, ticketStats: GuildTicketStats | null = null) {
    const panelChannel = config.ticketPanelChannelId ? `<#${config.ticketPanelChannelId}>` : '`Nicht gesetzt`';
    const staffRole = config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : '`Nicht gesetzt`';
    const ticketLogsChannel = config.ticketLogsChannelId ? `<#${config.ticketLogsChannelId}>` : '`Nicht gesetzt`';
    const transcriptChannel = config.ticketTranscriptChannelId ? `<#${config.ticketTranscriptChannelId}>` : '`Nicht gesetzt`';

    const openCategoryChannel = config.ticketCategoryId ? guild.channels.cache.get(config.ticketCategoryId) : null;
    const openCategory = openCategoryChannel ? openCategoryChannel.toString() : '`Nicht gesetzt`';
    
    const closedCategoryChannel = config.ticketClosedCategoryId ? guild.channels.cache.get(config.ticketClosedCategoryId) : null;
    const closedCategory = closedCategoryChannel ? closedCategoryChannel.toString() : '`Nicht gesetzt`';

    const rawMsg = config.ticketPanelMessage || 'Klick auf den Button unten, um ein Support-Ticket zu erstellen.';
    const panelMsg = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const btnLabel = `\`${config.ticketButtonLabel || 'Ticket erstellen'}\``;

    let panelStatusValue = formatPanelStatusField(panelStatus);

    const openTickets = ticketStats ? String(ticketStats.openCount) : '`—`';
    const avgCloseTime = ticketStats ? formatCloseDuration(ticketStats.avgCloseTimeMs) : '`—`';
    const feedbackSummary = ticketStats?.feedbackCount
        ? `${ticketStats.avgRating}/5 (${ticketStats.feedbackCount} Bewertung${ticketStats.feedbackCount !== 1 ? 'en' : ''})`
        : '`Noch keine Bewertungen`';

    return new EmbedBuilder()
        .setTitle('🎫 Ticket-System-Dashboard')
        .setDescription(`Verwalte die Ticket-Einstellungen für **${guild.name}**.\nWähl unten eine Option, um eine Einstellung zu ändern.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Panel-Status', value: panelStatusValue, inline: false },
            { name: 'Panel-Kanal', value: panelChannel, inline: true },
            { name: 'Team-Rolle', value: staffRole, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Kategorie offene Tickets', value: openCategory, inline: true },
            { name: 'Kategorie geschlossene Tickets', value: closedCategory, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Panel-Nachricht', value: panelMsg, inline: false },
            { name: 'Button-Beschriftung', value: btnLabel, inline: true },
            { name: 'Max. Tickets/Nutzer', value: String(config.maxTicketsPerUser || 3), inline: true },
            { name: 'DM beim Schließen', value: config.dmOnClose !== false ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Ticket-Log-Kanal', value: ticketLogsChannel, inline: true },
            { name: 'Transkript-Kanal', value: transcriptChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Offene Tickets', value: openTickets, inline: true },
            { name: 'Ø Zeit bis Schließen', value: avgCloseTime, inline: true },
            { name: 'Feedback-Bewertung', value: feedbackSummary, inline: true },
        )
        .setFooter({ text: 'Wähl unten eine Option • Das Dashboard schließt nach 10 Minuten Inaktivität' })
        .setTimestamp();
}

function buildSelectMenu(guildId: string) {
    return new StringSelectMenuBuilder()
        .setCustomId(`ticket_config_${guildId}`)
        .setPlaceholder('Einstellung zum Konfigurieren auswählen...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Panel-Nachricht bearbeiten')
                .setDescription('Die Nachricht auf dem Ticket-Panel ändern')
                .setValue('panel_message')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Button-Beschriftung bearbeiten')
                .setDescription('Die Beschriftung des Buttons „Ticket erstellen“ ändern')
                .setValue('button_label')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Kategorie für offene Tickets ändern')
                .setDescription('Kategorie, in der neue Tickets erstellt werden')
                .setValue('open_category')
                .setEmoji('📁'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Kategorie für geschlossene Tickets ändern')
                .setDescription('Kategorie, in die geschlossene Tickets verschoben werden')
                .setValue('closed_category')
                .setEmoji('📂'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Max. Tickets pro Nutzer festlegen')
                .setDescription('Begrenzen, wie viele offene Tickets ein Nutzer gleichzeitig haben kann')
                .setValue('max_tickets')
                .setEmoji('🔢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Ticket-Log-Kanal festlegen')
                .setDescription('Kanal für Ticket-Feedback, Ticket-Ereignisse und Logs')
                .setValue('logs_channel')
                .setEmoji('🎫'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Transkript-Kanal festlegen')
                .setDescription('Kanal für automatisch erstellte Transkripte beim Löschen')
                .setValue('transcript_channel')
                .setEmoji('📜'),
        );
}

async function refreshDashboard(rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    const panelStatus = client
        ? await getTicketPanelStatus(client, rootInteraction.guild!, guildConfig)
        : null;
    const ticketStats = client ? await getGuildTicketStats(guildId) : null;

    if (panelStatus?.recoveredId) {
        await persistPanelMessageId(client, guildId, guildConfig, panelStatus.recoveredId);
    }

    const buttonRow = buildButtonRow(guildConfig, guildId, false, panelStatus);
    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildSelectMenu(guildId));
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(guildConfig, rootInteraction.guild!, panelStatus, ticketStats)],
        components: [buttonRow, selectRow],
    }).catch(() => {});
}

async function updateLivePanel(client: NexoClient, guild: Guild, config: GuildConfig, guildId: string) {
    if (!config.ticketPanelChannelId) return false;
    try {
        const panelStatus = await getTicketPanelStatus(client, guild, config);
        if (panelStatus.recoveredId) {
            await persistPanelMessageId(client, guildId, config, panelStatus.recoveredId);
        }
        if (!panelStatus.exists || !panelStatus.message) return false;

        await panelStatus.message.edit({
            embeds: [buildPanelEmbed(config)],
            components: [buildPanelButtonRow(config)],
        });
        return true;
    } catch (error) {
        logger.warn('Failed to update live ticket panel:', (error as ErrorLike).message);
        return false;
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild!.id;
            const guildConfig = await getGuildConfig(client, guildId);

            if (!guildConfig.ticketPanelChannelId) {
                throw new NexoBotError(
                    'Ticket system not configured',
                    ErrorTypes.CONFIGURATION,
                    'Das Ticket-System ist noch nicht eingerichtet. Nutze zuerst `/ticket setup`, um es einzurichten.',
                );
            }

            const panelStatus = await getTicketPanelStatus(client, interaction.guild!, guildConfig);
            if (panelStatus.recoveredId) {
                await persistPanelMessageId(client, guildId, guildConfig, panelStatus.recoveredId);
            }

            const ticketStats = await getGuildTicketStats(guildId);

            const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildSelectMenu(guildId));
            const buttonRow = buildButtonRow(guildConfig, guildId, false, panelStatus);

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild!, panelStatus, ticketStats)],
                components: [buttonRow, selectRow],
                selectMenuId: `ticket_config_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `ticket_cfg_repost_${guildId}` ||
                    customId === `ticket_cfg_dm_toggle_${guildId}` ||
                    customId === `ticket_cfg_staff_role_btn_${guildId}` ||
                    customId === `ticket_cfg_delete_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'panel_message':
                            await handlePanelMessage(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'button_label':
                            await handleButtonLabel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'staff_role':
                            await handleStaffRole(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'open_category':
                            await handleOpenCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'closed_category':
                            await handleClosedCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'max_tickets':
                            await handleMaxTickets(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'logs_channel':
                            await handleLogsChannel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'transcript_channel':
                            await handleTranscriptChannel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `ticket_cfg_repost_${guildId}`) {
                        await handleRepostPanel(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_dm_toggle_${guildId}`) {
                        await handleDmOnClose(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_staff_role_btn_${guildId}`) {
                        await handleStaffRole(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_delete_${guildId}`) {
                        await handleDeleteSystem(btnInteraction, interaction, guildConfig, guildId, client);
                    }
                },
            });
        } catch (error) {
            if (error instanceof NexoBotError) throw error;
            logger.error('Unexpected error in ticket_config:', error);
            throw new NexoBotError(
                `Ticket config failed: ${(error as ErrorLike).message}`,
                ErrorTypes.UNKNOWN,
                'Das Ticket-Dashboard konnte nicht geöffnet werden.',
            );
        }
    },
} satisfies SubcommandModule & Pick<Command, 'prefixOnly'>;

async function handlePanelMessage(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_panel_msg')
        .setTitle('📝 Panel-Nachricht bearbeiten')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_msg_input')
                    .setLabel('Panel-Nachricht')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(
                        guildConfig.ticketPanelMessage ||
                            'Klick auf den Button unten, um ein Support-Ticket zu erstellen.',
                    )
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Klick auf den Button unten, um ein Support-Ticket zu erstellen.'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_panel_msg' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields.getTextInputValue('panel_msg_input').trim();
    guildConfig.ticketPanelMessage = newMessage;
    await setGuildConfig(client, guildId, guildConfig);

    const panelUpdated = await updateLivePanel(client, rootInteraction.guild!, guildConfig, guildId);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Panel-Nachricht aktualisiert',
                `Die Panel-Nachricht wurde aktualisiert.${
                    panelUpdated
                        ? '\nDas Live-Ticket-Panel wurde ebenfalls aktualisiert.'
                        : '\n> **Hinweis:** Das Live-Panel wurde nicht gefunden. Nutze **Panel neu posten** im Dashboard, um es wiederherzustellen.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleButtonLabel(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_btn_label')
        .setTitle('🏷️ Button-Beschriftung bearbeiten')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('btn_label_input')
                    .setLabel('Button-Beschriftung (max. 80 Zeichen)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(guildConfig.ticketButtonLabel || 'Ticket erstellen')
                    .setMaxLength(80)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Ticket erstellen'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_btn_label' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newLabel = submitted.fields.getTextInputValue('btn_label_input').trim();
    guildConfig.ticketButtonLabel = newLabel;
    await setGuildConfig(client, guildId, guildConfig);

    const panelUpdated = await updateLivePanel(client, rootInteraction.guild!, guildConfig, guildId);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Button-Beschriftung aktualisiert',
                `Button-Beschriftung auf \`${newLabel}\` geändert.${
                    panelUpdated
                        ? '\nDer Button im Live-Ticket-Panel wurde ebenfalls aktualisiert.'
                        : '\n> **Hinweis:** Das Live-Panel wurde nicht gefunden. Nutze **Panel neu posten** im Dashboard, um es wiederherzustellen.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleStaffRole(selectInteraction: StringSelectMenuInteraction | ButtonInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('ticket_cfg_staff_role')
        .setPlaceholder('Team-Rolle auswählen...')
        .setMaxValues(1);

    const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🛡️ Team-Rolle ändern')
                .setDescription(
                    `**Aktuell:** ${guildConfig.ticketStaffRoleId ? `<@&${guildConfig.ticketStaffRoleId}>` : '`Nicht gesetzt`'}\n\nWähl die Rolle, die als Team Tickets verwalten darf.`,
                )
                .setColor(getColor('info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_staff_role',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first()!;

        guildConfig.ticketStaffRoleId = role.id;
        await setGuildConfig(client, guildId, guildConfig);

        await roleInteraction.followUp({
            embeds: [successEmbed('Team-Rolle aktualisiert', `Team-Rolle auf ${role} gesetzt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Es wurde keine Rolle ausgewählt. Die Team-Rolle wurde nicht geändert.',
            }).catch(() => {});
        }
    });
}

async function handleOpenCategory(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_open_cat')
        .setPlaceholder('Kategorie auswählen...')
        .addChannelTypes(ChannelType.GuildCategory)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📁 Kategorie für offene Tickets ändern')
                .setDescription(
                    `**Aktuell:** ${guildConfig.ticketCategoryId ? `<#${guildConfig.ticketCategoryId}>` : '`Nicht gesetzt`'}\n\nWähl die Kategorie, in der neue Tickets erstellt werden.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const catCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_open_cat',
        time: 60_000,
        max: 1,
    });

    catCollector.on('collect', async catInteraction => {
        await catInteraction.deferUpdate();
        const category = catInteraction.channels.first() as CategoryChannel;

        guildConfig.ticketCategoryId = category.id;
        await setGuildConfig(client, guildId, guildConfig);

        await catInteraction.followUp({
            embeds: [
                successEmbed(
                    'Kategorie für offene Tickets aktualisiert',
                    `Neue Tickets werden jetzt in **${category.name}** erstellt.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    catCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Es wurde keine Kategorie ausgewählt. Die Einstellung wurde nicht geändert.',
            }).catch(() => {});
        }
    });
}

async function handleClosedCategory(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_closed_cat')
        .setPlaceholder('Kategorie auswählen...')
        .addChannelTypes(ChannelType.GuildCategory)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📂 Kategorie für geschlossene Tickets ändern')
                .setDescription(
                    `**Aktuell:** ${guildConfig.ticketClosedCategoryId ? `<#${guildConfig.ticketClosedCategoryId}>` : '`Nicht gesetzt`'}\n\nWähl die Kategorie, in die geschlossene Tickets verschoben werden.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const catCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_closed_cat',
        time: 60_000,
        max: 1,
    });

    catCollector.on('collect', async catInteraction => {
        await catInteraction.deferUpdate();
        const category = catInteraction.channels.first() as CategoryChannel;

        guildConfig.ticketClosedCategoryId = category.id;
        await setGuildConfig(client, guildId, guildConfig);

        await catInteraction.followUp({
            embeds: [
                successEmbed(
                    'Kategorie für geschlossene Tickets aktualisiert',
                    `Geschlossene Tickets werden jetzt nach **${category.name}** verschoben.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    catCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Es wurde keine Kategorie ausgewählt. Die Einstellung wurde nicht geändert.',
            }).catch(() => {});
        }
    });
}

async function handleMaxTickets(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_max_tickets')
        .setTitle('Max. Tickets pro Nutzer festlegen')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('max_tickets_input')
                    .setLabel('Max. offene Tickets (1–10)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(guildConfig.maxTicketsPerUser || 3))
                    .setMaxLength(2)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('3'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_max_tickets' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields.getTextInputValue('max_tickets_input').trim();
    const newMax = parseInt(raw, 10);

    if (Number.isNaN(newMax) || newMax < 1 || newMax > 10) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'Die maximale Ticketanzahl muss eine ganze Zahl zwischen **1** und **10** sein.',
        });
        return;
    }

    guildConfig.maxTicketsPerUser = newMax;
    await setGuildConfig(client, guildId, guildConfig);

    await submitted.reply({
        embeds: [
            successEmbed(
                'Max. Tickets aktualisiert',
                `Nutzer können jetzt höchstens **${newMax}** offene${newMax !== 1 ? '' : 's'} Ticket${newMax !== 1 ? 's' : ''} gleichzeitig haben.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleDmOnClose(btnInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    await btnInteraction.deferUpdate();

    const newState = guildConfig.dmOnClose === false;
    guildConfig.dmOnClose = newState;
    await setGuildConfig(client, guildId, guildConfig);

    await btnInteraction.followUp({
        embeds: [
            successEmbed(
                'DM beim Schließen aktualisiert',
                `Nutzer bekommen ${newState ? '**jetzt** eine DM' : '**keine** DM mehr'}, wenn ihr Ticket geschlossen wird.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleLogsChannel(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_logs_channel')
        .setPlaceholder('Kanal auswählen...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🎫 Ticket-Log-Kanal auswählen')
                .setDescription('Wähl, wohin Ticket-Feedback, Ticket-Ereignisse (Öffnen, Schließen, Übernehmen usw.) und andere Logs gesendet werden.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const collector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_logs_channel',
        time: 60_000,
        max: 1,
    });

    collector.on('collect', async channelInteraction => {
        await channelInteraction.deferUpdate();
        const channel = channelInteraction.channels.first()!;

        guildConfig.ticketLogsChannelId = channel.id;
        await setGuildConfig(client, guildId, guildConfig);

        await channelInteraction.followUp({
            embeds: [successEmbed('Log-Kanal aktualisiert', `Ticket-Logs werden an ${channel} gesendet`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Kein Kanal ausgewählt. Es wurde nichts geändert.',
            }).catch(() => {});
        }
    });
}

async function handleTranscriptChannel(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_transcript_channel')
        .setPlaceholder('Kanal auswählen...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📜 Transkript-Kanal auswählen')
                .setDescription('Wähl, wohin automatisch erstellte Transkripte beim Löschen von Tickets gesendet werden.')
                .setColor(getColor('info'))
        ],
        components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral
    });

    const collector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_transcript_channel',
        time: 60_000,
        max: 1
    });

    collector.on('collect', async channelInteraction => {
        await channelInteraction.deferUpdate();
        const channel = channelInteraction.channels.first()!;

        guildConfig.ticketTranscriptChannelId = channel.id;
        await setGuildConfig(client, guildId, guildConfig);

        await channelInteraction.followUp({
            embeds: [successEmbed('Transkript-Kanal aktualisiert', `Transkripte werden an ${channel} gesendet`)],
            flags: MessageFlags.Ephemeral
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Kein Kanal ausgewählt. Es wurde nichts geändert.',
            }).catch(() => {});
        }
    });
}

async function handleCheckUser(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    await selectInteraction.deferUpdate();

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('ticket_cfg_check_user')
        .setPlaceholder('Nutzer zum Prüfen auswählen...')
        .setMaxValues(1);

    const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Tickets eines Nutzers prüfen')
                .setDescription('Wähl einen Nutzer, um seine aktuell offenen Tickets zu sehen.')
                .setColor(getColor('info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const userCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.UserSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_check_user',
        time: 60_000,
        max: 1,
    });

    userCollector.on('collect', async userInteraction => {
        await userInteraction.deferUpdate();
        const targetUser = userInteraction.users.first()!;
        const maxTickets = guildConfig.maxTicketsPerUser || 3;
        const openCount = await getUserTicketCount(guildId, targetUser.id);
        const atLimit = openCount >= maxTickets;

        await userInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`Ticket-Check – ${targetUser.username}`)
                    .setDescription(
                        `**Offene Tickets:** ${openCount} / ${maxTickets}\n` +
                            `**Verbleibend:** ${Math.max(0, maxTickets - openCount)}\n\n` +
                            (atLimit
                                ? '⚠️ Dieser Nutzer hat sein Ticket-Limit erreicht.'
                                : '✅ Dieser Nutzer kann noch weitere Tickets öffnen.'),
                    )
                    .setColor(atLimit ? getColor('error') : getColor('success'))
                    .setThumbnail(targetUser.displayAvatarURL({ size: 64 }))
                    .setTimestamp(),
            ],
            flags: MessageFlags.Ephemeral,
        });
    });

    userCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Es wurde kein Nutzer ausgewählt.',
            }).catch(() => {});
        }
    });
}

async function handleRepostPanel(btnInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    await btnInteraction.deferUpdate();

    const panelStatus = await getTicketPanelStatus(client, rootInteraction.guild!, guildConfig);
    if (panelStatus.exists) {
        await btnInteraction.followUp({
            embeds: [infoEmbed('Panel bereits aktiv', 'Das Ticket-Panel ist im eingestellten Kanal bereits gepostet.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    const sentPanel = await repostTicketPanel(client, rootInteraction.guild!, guildConfig, guildId);

    await btnInteraction.followUp({
        embeds: [
            successEmbed(
                'Panel neu gepostet',
                `Ein neues Ticket-Panel wurde in <#${guildConfig.ticketPanelChannelId}> gepostet.${
                    sentPanel.url ? `\n[Panel-Nachricht öffnen](${sentPanel.url})` : ''
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleDeleteSystem(btnInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, guildConfig: GuildConfig, guildId: string, client: NexoClient) {
    const deleteModal = new ModalBuilder()
        .setCustomId('ticket_delete_confirm_modal')
        .setTitle('Ticket-System löschen')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('delete_confirmation')
                    .setLabel('Gib „DELETE“ zur Bestätigung ein')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('DELETE')
                    .setMaxLength(6)
                    .setMinLength(6)
                    .setRequired(true)
            )
        );

    await btnInteraction.showModal(deleteModal);

    const submitted = await btnInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'ticket_delete_confirm_modal' && i.user.id === btnInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    const confirmation = submitted.fields.getTextInputValue('delete_confirmation').trim();

    if (confirmation !== 'DELETE') {
        await replyUserError(submitted, { type: ErrorTypes.UNKNOWN, message: 'Du musst genau „DELETE“ eingeben, um das Löschen zu bestätigen.' });
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    await submitted.deferUpdate();

    const keysToDelete: (keyof GuildConfig)[] = [
        'ticketPanelChannelId',
        'ticketPanelMessageId',
        'ticketStaffRoleId',
        'ticketCategoryId',
        'ticketClosedCategoryId',
        'ticketPanelMessage',
        'ticketButtonLabel',
        'maxTicketsPerUser',
        'dmOnClose',
    ];

    if (guildConfig.ticketPanelChannelId) {
        try {
            const panelChannel = await client.guilds.cache.get(guildId)?.channels.fetch(guildConfig.ticketPanelChannelId).catch(() => null) as GuildTextBasedChannel | null | undefined;
            if (panelChannel) {
                if (guildConfig.ticketPanelMessageId) {
                    const panelMessage = await panelChannel.messages.fetch(guildConfig.ticketPanelMessageId).catch(() => null);
                    if (panelMessage) await panelMessage.delete().catch(() => {});
                } else {
                    
                    const messages = await panelChannel.messages.fetch({ limit: 50 }).catch(() => null);
                    if (messages) {
                        const found = messages.find(
                            m => m.author.id === client.user.id && messageHasButtonCustomId(m, 'create_ticket'),
                        );
                        if (found) await found.delete().catch(() => {});
                    }
                }
            }
        } catch (panelDeleteError) {
            logger.warn('Could not delete ticket panel message:', (panelDeleteError as ErrorLike).message);
        }
    }

    try {
        const { pgConfig } = await import('../../../config/database/postgres.js');
        if (client.db?.db?.pool && typeof client.db.db.isAvailable === 'function' && client.db.db.isAvailable()) {
            await client.db.db.pool.query(
                `DELETE FROM ${pgConfig.tables.tickets} WHERE guild_id = $1`,
                [guildId]
            );
        }
    } catch (ticketDeleteError) {
        logger.warn('Could not clear ticket records from database:', (ticketDeleteError as ErrorLike).message);
    }

    for (const key of keysToDelete) {
        delete guildConfig[key];
    }
    await setGuildConfig(client, guildId, guildConfig);

    await submitted.followUp({
        embeds: [
            successEmbed(
                '✅ Ticket-System gelöscht',
                'Die gesamte Ticket-Konfiguration wurde entfernt. Nutze `/ticket setup`, um es neu einzurichten.',
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('Ticket-System gelöscht')
                .setDescription('Die Ticket-Konfiguration wurde entfernt.')
                .setColor(getColor('error'))
                .setTimestamp(),
        ],
        components: [],
    }).catch(() => {});
}
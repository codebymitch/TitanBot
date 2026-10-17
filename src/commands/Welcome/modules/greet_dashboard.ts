import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    FileUploadBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import type {
    ChatInputCommandInteraction,
    Guild,
    GuildBasedChannel,
    InteractionReplyOptions,
    MessageComponentInteraction,
    StringSelectMenuInteraction,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getWelcomeConfig, saveWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import type { WelcomeConfig, WelcomeEmbedConfig } from '../../../utils/database.js';
import type { NexoClient, SubcommandModule } from '../../../types/index.js';

async function deferComponent(interaction: MessageComponentInteraction) {
    if (interaction.deferred || interaction.replied) {
        return true;
    }

    try {
        await interaction.deferUpdate();
        return true;
    } catch (error) {
        logger.debug('Component interaction expired or already acknowledged:', (error as Error).message);
        return false;
    }
}

async function sendEphemeralFollowUp(interaction: MessageComponentInteraction, payload: InteractionReplyOptions) {
    try {
        await interaction.followUp({
            ...payload,
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('Failed to send ephemeral follow-up:', (error as Error).message);
    }
}

function buildDashboardEmbed(cfg: WelcomeConfig, guild: Guild) {
    const welcomeChannel = cfg.channelId ? `<#${cfg.channelId}>` : '`Nicht gesetzt`';
    const goodbyeChannel = cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : '`Nicht gesetzt`';

    const rawWelcome = cfg.welcomeMessage || 'Willkommen {user} auf {server}!';
    const rawGoodbye = cfg.leaveMessage || '{user.tag} hat den Server verlassen.';
    const welcomePreview = `\`${rawWelcome.length > 55 ? rawWelcome.substring(0, 55) + '…' : rawWelcome}\``;
    const goodbyePreview = `\`${rawGoodbye.length > 55 ? rawGoodbye.substring(0, 55) + '…' : rawGoodbye}\``;

    return new EmbedBuilder()
        .setTitle('👋 Willkommen & Abschied – Dashboard')
        .setDescription(
            `Verwalte die Willkommens- und Abschiedseinstellungen für **${guild.name}**.\nAktiviere oder deaktiviere beide Seiten mit den Schaltern und wähle dann eine Option zum Bearbeiten.`,
        )
        .setColor(getColor('info'))
        .addFields(
            { name: 'Willkommenskanal', value: welcomeChannel, inline: true },
            { name: 'Willkommen-Status', value: cfg.enabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Willkommen-Ping', value: cfg.welcomePing ? 'An' : 'Aus', inline: true },
            { name: 'Abschiedskanal', value: goodbyeChannel, inline: true },
            { name: 'Abschied-Status', value: cfg.goodbyeEnabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Abschied-Ping', value: cfg.goodbyePing ? 'An' : 'Aus', inline: true },
            { name: 'Willkommensnachricht', value: welcomePreview, inline: false },
            { name: 'Abschiedsnachricht', value: goodbyePreview, inline: false },
        )
        .setFooter({ text: 'Das Dashboard schließt sich nach 10 Minuten Inaktivität' })
        .setTimestamp();
}

function buildSelectMenu(guildId: string) {
    return new StringSelectMenuBuilder()
        .setCustomId(`greet_cfg_${guildId}`)
        .setPlaceholder('Wähle eine Einstellung...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Willkommenskanal')
                .setDescription('Lege fest, in welchem Kanal Willkommensnachrichten gesendet werden')
                .setValue('welcome_channel')
                .setEmoji('🟢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Willkommensnachricht')
                .setDescription('Bearbeite den Text, der beim Beitritt eines Mitglieds erscheint')
                .setValue('welcome_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Willkommensbild')
                .setDescription('Lege das Bild für Willkommensnachrichten fest')
                .setValue('welcome_image')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Abschiedskanal')
                .setDescription('Lege fest, in welchem Kanal Abschiedsnachrichten gesendet werden')
                .setValue('goodbye_channel')
                .setEmoji('🔴'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Abschiedsnachricht')
                .setDescription('Bearbeite den Text, der beim Verlassen eines Mitglieds erscheint')
                .setValue('goodbye_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Abschiedsbild')
                .setDescription('Lege das Bild für Abschiedsnachrichten fest')
                .setValue('goodbye_image')
                .setEmoji('🖼️'),
        );
}

function buildButtonRow(cfg: WelcomeConfig, guildId: string, disabled = false) {
    const welcomeOn = cfg.enabled === true;
    const goodbyeOn = cfg.goodbyeEnabled === true;
    const welcomePingOn = cfg.welcomePing === true;
    const goodbyePingOn = cfg.goodbyePing === true;
    
    return [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_welcome_${guildId}`)
                .setLabel('Willkommen')
                .setStyle(welcomeOn ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji('🟢')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_goodbye_${guildId}`)
                .setLabel('Abschied')
                .setStyle(goodbyeOn ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji('🔴')
                .setDisabled(disabled),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_welcome_${guildId}`)
                .setLabel('Ping bei Willkommen')
                .setStyle(welcomePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_goodbye_${guildId}`)
                .setLabel('Ping bei Abschied')
                .setStyle(goodbyePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
        ),
    ];
}

async function refreshDashboard(rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string) {
    try {
        const selectMenu = buildSelectMenu(guildId);
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild!)],
            components: [
                ...buildButtonRow(cfg, guildId),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
            ],
        });
    } catch (error) {
        logger.debug('Could not refresh greet dashboard (interaction may have expired):', (error as Error).message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild!.id;
            const cfg = await getWelcomeConfig(client, guildId);

            if (!cfg.channelId && !cfg.goodbyeChannelId) {
                throw new NexoBotError(
                    'Greet system not configured',
                    ErrorTypes.CONFIGURATION,
                    'Weder Willkommen noch Abschied sind eingerichtet. Führe zuerst `/welcome message setup` oder `/welcome goodbye setup` aus.',
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!interaction.deferred) {
                return;
            }

            const selectMenu = buildSelectMenu(guildId);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(cfg, interaction.guild!)],
                components: [
                    ...buildButtonRow(cfg, guildId),
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
                ],
            });

            const collector = interaction.channel!.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `greet_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'welcome_channel':
                            await handleWelcomeChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_message':
                            await handleWelcomeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_image':
                            await handleWelcomeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_channel':
                            await handleGoodbyeChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_message':
                            await handleGoodbyeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_image':
                            await handleGoodbyeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof NexoBotError) {
                        logger.debug(`Greet config validation error: ${(error as Error).message}`);
                    } else {
                        logger.error('Unexpected greet dashboard error:', error);
                    }

                    const errorMessage =
                        error instanceof NexoBotError
                            ? error.userMessage || 'Beim Verarbeiten deiner Auswahl ist ein Fehler aufgetreten.'
                            : 'Beim Aktualisieren der Konfiguration ist ein unerwarteter Fehler aufgetreten.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: errorMessage,
                    }).catch(() => {});
                }
            });

            const btnCollector = interaction.channel!.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id &&
                    (i.customId === `greet_cfg_toggle_welcome_${guildId}` ||
                        i.customId === `greet_cfg_toggle_goodbye_${guildId}` ||
                        i.customId === `greet_cfg_ping_welcome_${guildId}` ||
                        i.customId === `greet_cfg_ping_goodbye_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (!await deferComponent(btnInteraction)) {
                        return;
                    }

                    const customId = btnInteraction.customId;

                    if (customId === `greet_cfg_toggle_welcome_${guildId}`) {
                        cfg.enabled = !cfg.enabled;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Willkommen aktualisiert',
                                    `Willkommensnachrichten sind jetzt **${cfg.enabled ? 'aktiviert' : 'deaktiviert'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_toggle_goodbye_${guildId}`) {
                        cfg.goodbyeEnabled = !cfg.goodbyeEnabled;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Abschied aktualisiert',
                                    `Abschiedsnachrichten sind jetzt **${cfg.goodbyeEnabled ? 'aktiviert' : 'deaktiviert'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_welcome_${guildId}`) {
                        cfg.welcomePing = !cfg.welcomePing;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Willkommen-Ping aktualisiert',
                                    `Neue Nutzer werden in der Willkommensnachricht${cfg.welcomePing ? '' : ' **nicht**'} gepingt.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_goodbye_${guildId}`) {
                        cfg.goodbyePing = !cfg.goodbyePing;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ Abschied-Ping aktualisiert',
                                    `Gehende Nutzer werden in der Abschiedsnachricht${cfg.goodbyePing ? '' : ' **nicht**'} gepingt.`,
                                ),
                            ],
                        });
                    }

                    await refreshDashboard(interaction, cfg, guildId);
                } catch (error) {
                    logger.error('Error handling greet dashboard button:', error);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    try {
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Dashboard abgelaufen')
                                    .setDescription('Dieses Dashboard wurde wegen Inaktivität geschlossen. Führe den Command erneut aus, um weiterzumachen.')
                                    .setColor(getColor('error'))
                            ],
                            components: [],
                        });
                    } catch (error) {
                        logger.debug('Could not update dashboard on timeout:', (error as Error).message);
                    }
                }
            });
        } catch (error) {
            if (error instanceof NexoBotError) throw error;
            logger.error('Unexpected error in greet_dashboard:', error);
            throw new NexoBotError(
                `Greet dashboard failed: ${(error as Error).message}`,
                ErrorTypes.UNKNOWN,
                'Das Willkommen-Dashboard konnte nicht geöffnet werden.',
            );
        }
    },
} satisfies SubcommandModule & { prefixOnly: boolean };

async function handleWelcomeChannel(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string, client: NexoClient) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('greet_cfg_welcome_channel')
        .setPlaceholder('Wähle einen Textkanal...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🟢 Willkommenskanal')
                .setDescription(
                    `**Aktuell:** ${cfg.channelId ?`<#${cfg.channelId}>`: '`Nicht gesetzt`'}\n\nWähle den Kanal, in dem Willkommensnachrichten gesendet werden.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect)],
    });

    const chanCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_welcome_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }
        const channel = chanInteraction.channels.first() as GuildBasedChannel | undefined;

        if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `Ich brauche **Kanal ansehen**, **Nachrichten senden** und **Links einbetten** in ${channel}.`,
            });
            return;
        }

        cfg.channelId = channel!.id;
        await saveWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [successEmbed('Kanal aktualisiert', `Willkommensnachrichten werden jetzt in ${channel} gesendet.`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Es wurde kein Kanal ausgewählt. Die Einstellung wurde nicht geändert.',
            }).catch(() => {});
        }
    });
}

async function handleWelcomeMessage(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_message')
        .setTitle('Willkommensnachricht bearbeiten')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Nachricht (Variablen: {user}, {server} usw.)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.welcomeMessage || 'Willkommen {user} auf {server}!')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_welcome_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    cfg.welcomeMessage = submitted.fields.getTextInputValue('message_input').trim();
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Willkommensnachricht aktualisiert', 'Die Willkommensnachricht wurde gespeichert.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomeImage(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_image')
        .setTitle('Willkommensbild festlegen');

    const imageHint = new TextDisplayBuilder()
        .setContent('Gib eine direkte Bild-URL an **oder** lade unten eine Datei hoch. Gibst du beides an, hat die hochgeladene Datei Vorrang. Lass die URL leer und überspring den Upload, um das Bild zu entfernen.');

    const urlLabel = new LabelBuilder()
        .setLabel('Bild-URL (optional)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/welcome.png')
                .setStyle(TextInputStyle.Short)
                .setValue(cfg.welcomeImage || '')
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('Oder lade eine Bilddatei hoch (optional)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_welcome_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const uploadedFiles = submitted.fields.getUploadedFiles('image_upload');
    let imageUrl = uploadedFiles?.at(0)?.url ?? submitted.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Die Bild-URL muss mit `http://` oder `https://` beginnen.' });
                return;
            }
        } catch {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Bitte gib eine gültige Bild-URL an.' });
            return;
        }
    }

    cfg.welcomeImage = imageUrl || null;
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Willkommensbild aktualisiert', `Bild erfolgreich ${imageUrl ? 'aktualisiert' : 'entfernt'}.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomePing(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string, client: NexoClient) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.welcomePing = !cfg.welcomePing;
    await saveWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            successEmbed(
                '✅ Willkommen-Ping aktualisiert',
                `Neue Nutzer werden in der Willkommensnachricht${cfg.welcomePing ? '' : ' **nicht**'} gepingt.`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeChannel(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string, client: NexoClient) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('greet_cfg_goodbye_channel')
        .setPlaceholder('Wähle einen Textkanal...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🔴 Abschiedskanal')
                .setDescription(
                    `**Aktuell:** ${cfg.goodbyeChannelId ?`<#${cfg.goodbyeChannelId}>`: '`Nicht gesetzt`'}\n\nWähle den Kanal, in dem Abschiedsnachrichten gesendet werden.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect)],
    });

    const chanCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_goodbye_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }
        const channel = chanInteraction.channels.first() as GuildBasedChannel | undefined;

        if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `Ich brauche **Kanal ansehen**, **Nachrichten senden** und **Links einbetten** in ${channel}.`,
            });
            return;
        }

        cfg.goodbyeChannelId = channel!.id;
        await saveWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [successEmbed('Kanal aktualisiert', `Abschiedsnachrichten werden jetzt in ${channel} gesendet.`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Es wurde kein Kanal ausgewählt. Die Einstellung wurde nicht geändert.',
            }).catch(() => {});
        }
    });
}

async function handleGoodbyeMessage(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_message')
        .setTitle('Abschiedsnachricht bearbeiten')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Nachricht (Variablen: {user}, {server} usw.)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.leaveMessage || '{user.tag} hat den Server verlassen.')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    cfg.leaveMessage = submitted.fields.getTextInputValue('message_input').trim();
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Abschiedsnachricht aktualisiert', 'Die Abschiedsnachricht wurde gespeichert.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeImage(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_image')
        .setTitle('Abschiedsbild festlegen');

    const imageHint = new TextDisplayBuilder()
        .setContent('Gib eine direkte Bild-URL an **oder** lade unten eine Datei hoch. Gibst du beides an, hat die hochgeladene Datei Vorrang. Lass die URL leer und überspring den Upload, um das Bild zu entfernen.');

    const urlLabel = new LabelBuilder()
        .setLabel('Bild-URL (optional)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/goodbye.png')
                .setStyle(TextInputStyle.Short)
                .setValue(
                    typeof cfg.leaveEmbed?.image === 'string'
                        ? cfg.leaveEmbed.image
                        : (cfg.leaveEmbed?.image as { url?: string } | undefined)?.url || ''
                )
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('Oder lade eine Bilddatei hoch (optional)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const uploadedFiles = submitted.fields.getUploadedFiles('image_upload');
    let imageUrl = uploadedFiles?.at(0)?.url ?? submitted.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Die Bild-URL muss mit `http://` oder `https://` beginnen.' });
                return;
            }
        } catch {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Bitte gib eine gültige Bild-URL an.' });
            return;
        }
    }

    const nextLeaveEmbed: WelcomeEmbedConfig = { ...(cfg.leaveEmbed || {}) };
    if (imageUrl) {
        nextLeaveEmbed.image = imageUrl;
    } else {
        delete nextLeaveEmbed.image;
    }

    cfg.leaveEmbed = nextLeaveEmbed;
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Abschiedsbild aktualisiert', `Bild erfolgreich ${imageUrl ? 'aktualisiert' : 'entfernt'}.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyePing(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: WelcomeConfig, guildId: string, client: NexoClient) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.goodbyePing = !cfg.goodbyePing;
    await saveWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            successEmbed(
                '✅ Abschied-Ping aktualisiert',
                `Gehende Nutzer werden in der Abschiedsnachricht${cfg.goodbyePing ? '' : ' **nicht**'} gepingt.`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}
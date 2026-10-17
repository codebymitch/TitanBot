import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import type { ChatInputCommandInteraction, Guild, StringSelectMenuInteraction, TextChannel } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import {
    getVerificationPanelStatus,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';
import type { PanelStatus } from '../../../utils/panelStatus.js';
import type { VerificationConfig } from '../../../services/verificationService.js';
import type { NexoClient, SubcommandModule } from '../../../types/index.js';

async function updateLivePanel(guild: Guild, cfg: VerificationConfig) {
    if (!cfg.channelId || !cfg.messageId) return;
    try {
        const channel = guild.channels.cache.get(cfg.channelId) as TextChannel | undefined;
        if (!channel) return;
        const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
        if (!msg) return;

        const verifyEmbed = new EmbedBuilder()
            .setTitle('Server-Verifizierung')
            .setDescription(cfg.message || botConfig.verification.defaultMessage)
            .setColor(getColor('success'));

        const verifyButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('verify_user')
                .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
        );

        await msg.edit({ embeds: [verifyEmbed], components: [verifyButton] });
    } catch (error) {
        logger.warn('Could not update live verification panel:', (error as Error).message);
    }
}

function buildDashboardEmbed(cfg: VerificationConfig, guild: Guild, verifiedUserCount = 0, conflictSummary = '', panelStatus: PanelStatus | null = null) {
    const channel = cfg.channelId ? `<#${cfg.channelId}>` : '`Nicht gesetzt`';
    const role = cfg.roleId ? `<@&${cfg.roleId}>` : '`Nicht gesetzt`';
    const rawMsg = cfg.message || botConfig.verification.defaultMessage;
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const buttonText = cfg.buttonText || botConfig.verification.defaultButtonText;
    const panelStatusValue = cfg.channelId ? formatPanelStatusField(panelStatus) : '`Nicht eingerichtet`';

    const embed = new EmbedBuilder()
        .setTitle('✅ Verifizierungs-Dashboard')
        .setDescription(`Verwalte die Verifizierungseinstellungen für **${guild.name}**.\nWähle unten eine Option, um eine Einstellung zu ändern.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Panel-Status', value: panelStatusValue, inline: false },
            { name: 'Verifizierungskanal', value: channel, inline: true },
            { name: 'Verifizierungsrolle', value: role, inline: true },
            { name: 'Systemstatus', value: cfg.enabled !== false ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Button-Text', value: `\`${buttonText}\``, inline: true },
            { name: 'Verifizierte Nutzer', value: `${verifiedUserCount} Nutzer`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Verifizierungsnachricht', value: msgPreview, inline: false },
        );

    if (conflictSummary) {
        embed.addFields({ name: 'Konflikte bei der Einrichtung', value: conflictSummary, inline: false });
    }

    return embed
        .setFooter({ text: 'Das Dashboard schließt sich nach 10 Minuten Inaktivität' })
        .setTimestamp();
}

function buildSelectMenu(guildId: string) {
    return new StringSelectMenuBuilder()
        .setCustomId(`verif_cfg_${guildId}`)
        .setPlaceholder('Wähle eine Einstellung...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Verifizierungskanal ändern')
                .setDescription('Lege fest, in welchem Kanal das Verifizierungs-Panel gepostet wird')
                .setValue('channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Verifizierungsrolle ändern')
                .setDescription('Lege die Rolle fest, die ein Nutzer bei der Verifizierung erhält')
                .setValue('role')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Verifizierungsnachricht bearbeiten')
                .setDescription('Passe die Nachricht im Embed des Verifizierungs-Panels an')
                .setValue('message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Button-Text bearbeiten')
                .setDescription('Ändere die Beschriftung des Verifizierungs-Buttons')
                .setValue('button_text')
                .setEmoji('🔘'),
        );
}

function buildButtonRow(cfg: VerificationConfig, guildId: string, disabled = false, panelStatus: PanelStatus | null = null) {
    const systemOn = cfg.enabled !== false;
    const showRepost =
        systemOn && panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const buttons: ButtonBuilder[] = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`verif_cfg_repost_${guildId}`)
                .setLabel('Panel neu posten')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`verif_cfg_toggle_${guildId}`)
            .setLabel('Verifizierung')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('🔒')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

async function repostVerificationPanel(guild: Guild, cfg: VerificationConfig) {
    const channel = (await guild.channels.fetch(cfg.channelId!).catch(() => null)) as TextChannel | null;
    if (!channel) {
        throw new NexoBotError(
            'Panel channel missing',
            ErrorTypes.CONFIGURATION,
            'Der eingerichtete Verifizierungskanal existiert nicht mehr. Lege im Dashboard einen neuen Kanal fest.',
        );
    }

    const verifyEmbed = new EmbedBuilder()
        .setTitle('Server-Verifizierung')
        .setDescription(cfg.message || botConfig.verification.defaultMessage)
        .setColor(getColor('success'));

    const verifyButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('verify_user')
            .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
    );

    return channel.send({ embeds: [verifyEmbed], components: [verifyButton] });
}

async function refreshDashboard(rootInteraction: ChatInputCommandInteraction, cfg: VerificationConfig, guildId: string, client: NexoClient) {
    try {
        const selectMenu = buildSelectMenu(guildId);

        let verifiedUserCount = 0;
        let conflictSummary = '';
        let panelStatus: PanelStatus | null = null;

        if (cfg.channelId && cfg.enabled !== false) {
            panelStatus = await getVerificationPanelStatus(client, rootInteraction.guild!, cfg);
            if (panelStatus.recoveredId) {
                cfg.messageId = panelStatus.recoveredId;
                const latestConfig = await getGuildConfig(client, guildId);
                latestConfig.verification = cfg;
                await setGuildConfig(client, guildId, latestConfig);
            }
        }
        
        try {
            const verifiedRole = rootInteraction.guild!.roles.cache.get(cfg.roleId!);
            if (verifiedRole) {
                verifiedUserCount = verifiedRole.members.size;
            }
            
            const guildConfig = await getGuildConfig(client, guildId);
            const welcomeConfig = await getWelcomeConfig(client, guildId);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
            const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
            
            const conflicts = [
                autoVerifyEnabled ? 'AutoVerify ist aktiviert' : null,
                autoRoleConfigured ? 'Eine Auto-Rolle ist eingerichtet' : null
            ].filter(Boolean);
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');
            }
        } catch (error) {
            logger.warn('Could not fetch verification dashboard details:', (error as Error).message);
        }
        
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild!, verifiedUserCount, conflictSummary, panelStatus)],
            components: [
                buildButtonRow(cfg, guildId, false, panelStatus),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('Could not refresh verification dashboard (interaction may have expired):', (error as Error).message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild!.id;
            const guildConfig = await getGuildConfig(client, guildId);
            const cfg = guildConfig.verification;

            if (!cfg?.channelId) {
                throw new NexoBotError(
                    'Verification not configured',
                    ErrorTypes.CONFIGURATION,
                    'Das Verifizierungssystem ist noch nicht eingerichtet. Führe zuerst `/verification setup` aus.',
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let verifiedUserCount = 0;
            let conflictSummary = '';
            let panelStatus: PanelStatus | null = null;

            if (cfg.channelId && cfg.enabled !== false) {
                panelStatus = await getVerificationPanelStatus(client, interaction.guild!, cfg);
                if (panelStatus.recoveredId) {
                    cfg.messageId = panelStatus.recoveredId;
                    guildConfig.verification = cfg;
                    await setGuildConfig(client, guildId, guildConfig);
                }
            }
            
            try {
                const verifiedRole = interaction.guild!.roles.cache.get(cfg.roleId!);
                if (verifiedRole) {
                    verifiedUserCount = verifiedRole.members.size;
                }
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
                
                const conflicts = [
                    autoVerifyEnabled ? 'AutoVerify ist aktiviert' : null,
                    autoRoleConfigured ? 'Eine Auto-Rolle ist eingerichtet' : null
                ].filter(Boolean);
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');
                }
            } catch (error) {
                logger.warn('Could not fetch verification dashboard details:', (error as Error).message);
            }

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(cfg, interaction.guild!, verifiedUserCount, conflictSummary, panelStatus)],
                components: [
                    buildButtonRow(cfg, guildId, false, panelStatus),
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildSelectMenu(guildId)),
                ],
                flags: MessageFlags.Ephemeral,
                selectMenuId: `verif_cfg_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `verif_cfg_toggle_${guildId}` || customId === `verif_cfg_repost_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'channel':
                            await handleChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'role':
                            await handleRole(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'message':
                            await handleMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'button_text':
                            await handleButtonText(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `verif_cfg_repost_${guildId}`) {
                        await btnInteraction.deferUpdate();
                        const newMsg = await repostVerificationPanel(interaction.guild!, cfg);
                        cfg.messageId = newMsg.id;
                        const latestConfig = await getGuildConfig(client, guildId);
                        latestConfig.verification = cfg;
                        await setGuildConfig(client, guildId, latestConfig);
                        await btnInteraction.followUp({
                            embeds: [successEmbed('Panel neu gepostet', `Das Verifizierungs-Panel wurde in ${newMsg.channel} wiederhergestellt.`)],
                            flags: MessageFlags.Ephemeral,
                        });
                        await refreshDashboard(interaction, cfg, guildId, client);
                        return;
                    }

                    await btnInteraction.deferUpdate().catch(() => null);

                    const wasEnabled = cfg.enabled !== false;
                    const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

                    if (!wasEnabled && autoVerifyEnabled) {
                        await replyUserError(btnInteraction, {
                            type: ErrorTypes.CONFIGURATION,
                            message: 'AutoVerify ist derzeit aktiviert. Deaktiviere zuerst AutoVerify, bevor du die manuelle Verifizierung aktivierst.\n\nMit `/verification autoverify dashboard` öffnest du das AutoVerify-Dashboard.',
                        });
                        return;
                    }

                    cfg.enabled = !wasEnabled;

                    if (!cfg.enabled && cfg.channelId && cfg.messageId) {
                        const channel = interaction.guild!.channels.cache.get(cfg.channelId) as TextChannel | undefined;
                        if (channel) {
                            const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
                            if (msg) await msg.delete().catch(() => {});
                        }
                    }

                    if (cfg.enabled && cfg.channelId) {
                        try {
                            const newMsg = await repostVerificationPanel(interaction.guild!, cfg);
                            cfg.messageId = newMsg.id;
                        } catch (error) {
                            logger.warn('Could not re-post verification panel on re-enable:', (error as Error).message);
                        }
                    }

                    const latestConfig = await getGuildConfig(client, guildId);
                    latestConfig.verification = cfg;
                    await setGuildConfig(client, guildId, latestConfig);

                    await btnInteraction.followUp({
                        embeds: [
                            successEmbed(
                                '✅ System aktualisiert',
                                `Das Verifizierungssystem ist jetzt **${cfg.enabled ? 'aktiviert' : 'deaktiviert'}**.`,
                            ),
                        ],
                        flags: MessageFlags.Ephemeral,
                    });

                    await refreshDashboard(interaction, cfg, guildId, client);
                },
                onTimeout: async (rootInteraction) => {
                    await InteractionHelper.safeEditReply(rootInteraction, {
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Dashboard abgelaufen')
                                .setDescription('Dieses Dashboard wurde wegen Inaktivität geschlossen. Führe den Command erneut aus, um weiterzumachen.')
                                .setColor(getColor('error')),
                        ],
                        components: [],
                        flags: MessageFlags.Ephemeral,
                    });
                },
            });
        } catch (error) {
            if (error instanceof NexoBotError) throw error;
            logger.error('Unexpected error in verification_dashboard:', error);
            throw new NexoBotError(
                `Verification dashboard failed: ${(error as Error).message}`,
                ErrorTypes.UNKNOWN,
                'Das Verifizierungs-Dashboard konnte nicht geöffnet werden.',
            );
        }
    },
} satisfies SubcommandModule & { prefixOnly: boolean };

async function handleChannel(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: VerificationConfig, guildId: string, client: NexoClient) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('verif_cfg_channel')
        .setPlaceholder('Wähle einen Textkanal...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Verifizierungskanal ändern')
                .setDescription(
                    `**Aktuell:** ${cfg.channelId ?`<#${cfg.channelId}>`: '`Nicht gesetzt`'}\n\nWähle den Kanal, in dem das Verifizierungs-Panel gepostet wird.\n\n> ⚠️ Das bestehende Panel wird gelöscht und im neuen Kanal neu gepostet.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        await chanInteraction.deferUpdate();
        const newChannel = chanInteraction.channels.first() as TextChannel | undefined;

        if (!botHasPermission(newChannel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `Ich brauche die Berechtigungen **Kanal ansehen**, **Nachrichten senden** und **Links einbetten** in ${newChannel}.`,
            });
            return;
        }

        if (cfg.channelId && cfg.messageId) {
            const oldChannel = rootInteraction.guild!.channels.cache.get(cfg.channelId) as TextChannel | undefined;
            if (oldChannel) {
                try {
                    const oldMsg = await oldChannel.messages.fetch(cfg.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete();
                } catch {
                    
                }
            }
        }

        if (cfg.enabled !== false) {
            try {
                const verifyEmbed = new EmbedBuilder()
                    .setTitle('Server-Verifizierung')
                    .setDescription(cfg.message || botConfig.verification.defaultMessage)
                    .setColor(getColor('success'));

                const verifyButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_user')
                        .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                );

                const newMsg = await newChannel!.send({ embeds: [verifyEmbed], components: [verifyButton] });
                cfg.messageId = newMsg.id;
            } catch (error) {
                logger.warn('Could not post verification panel in new channel:', (error as Error).message);
            }
        }

        cfg.channelId = newChannel!.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await chanInteraction.followUp({
            embeds: [successEmbed('Kanal aktualisiert', `Das Verifizierungs-Panel wurde nach ${newChannel} verschoben.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
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

async function handleRole(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: VerificationConfig, guildId: string, client: NexoClient) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('verif_cfg_role')
        .setPlaceholder('Wähle eine Rolle...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Verifizierungsrolle ändern')
                .setDescription(
                    `**Aktuell:** ${cfg.roleId ?`<@&${cfg.roleId}>`: '`Nicht gesetzt`'}\n\nWähle die Rolle, die ein Nutzer bei der Verifizierung erhält.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_role',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first()!;
        const guild = rootInteraction.guild!;
        const botMember = guild.members.me!;

        if (role.id === guild.id || role.managed) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,
                message: 'Bitte wähle eine normale, vergebbare Rolle (nicht @everyone und keine von einem Bot verwaltete Rolle).',
            });
            return;
        }

        if (role.position >= botMember.roles.highest.position) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,
                message: 'Die Verifizierungsrolle muss in der Rollenhierarchie unter meiner höchsten Rolle liegen.',
            });
            return;
        }

        cfg.roleId = role.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await roleInteraction.followUp({
            embeds: [successEmbed('Rolle aktualisiert', `Verifizierungsrolle auf ${role} gesetzt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Es wurde keine Rolle ausgewählt. Die Einstellung wurde nicht geändert.',
            }).catch(() => {});
        }
    });
}

async function handleMessage(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: VerificationConfig, guildId: string, client: NexoClient) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_message')
            .setTitle('Verifizierungsnachricht bearbeiten')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('message_input')
                        .setLabel('Nachricht im Verifizierungs-Panel')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(cfg.message || botConfig.verification.defaultMessage)
                        .setMaxLength(2000)
                        .setMinLength(1)
                        .setRequired(true),
                ),
            );

        await selectInteraction.showModal(modal);

        const submitted = await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'verif_cfg_message' && i.user.id === selectInteraction.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        cfg.message = submitted.fields.getTextInputValue('message_input').trim();

        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await updateLivePanel(rootInteraction.guild!, cfg);

        await submitted.reply({
            embeds: [successEmbed('Nachricht aktualisiert', 'Das Verifizierungs-Panel zeigt jetzt die neue Nachricht.')],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    } catch (error) {
        logger.error('Error in handleMessage:', error);
        
    }
}

async function handleButtonText(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: VerificationConfig, guildId: string, client: NexoClient) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_button_text')
            .setTitle('Button-Text bearbeiten')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('button_text_input')
                        .setLabel('Button-Beschriftung (max. 80 Zeichen)')
                        .setStyle(TextInputStyle.Short)
                        .setValue(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setMaxLength(80)
                        .setMinLength(1)
                        .setRequired(true),
                ),
            );

        await selectInteraction.showModal(modal);

        const submitted = await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'verif_cfg_button_text' && i.user.id === selectInteraction.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        cfg.buttonText = submitted.fields.getTextInputValue('button_text_input').trim();

        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await updateLivePanel(rootInteraction.guild!, cfg);

        await submitted.reply({
            embeds: [successEmbed('Button-Text aktualisiert', `Der Verifizierungs-Button zeigt jetzt **${cfg.buttonText}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    } catch (error) {
        logger.error('Error in handleButtonText:', error);
        
    }
}
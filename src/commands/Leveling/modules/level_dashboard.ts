import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import type { ChatInputCommandInteraction, Guild, SelectMenuModalData, StringSelectMenuInteraction } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getLevelingConfig, saveLevelingConfig } from '../../../services/leveling/leveling.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';
import type { GuildLevelingConfig } from '../../../services/leveling/leveling.js';
import type { NexoClient, SubcommandModule } from '../../../types/index.js';

function buildDashboardEmbed(cfg: GuildLevelingConfig, guild: Guild) {
    const channel = cfg.levelUpChannel ? `<#${cfg.levelUpChannel}>` : '`Nicht gesetzt`';
    const xpMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const xpMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 25;
    const cooldown = cfg.xpCooldown ?? 60;
    const rawMsg = cfg.levelUpMessage || '{user} ist auf Level {level} aufgestiegen!';
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;

    const rewards = cfg.roleRewards ?? {};
    const rewardEntries = Object.entries(rewards).sort(([a], [b]) => Number(a) - Number(b));
    const rewardsValue = rewardEntries.length > 0
        ? rewardEntries.map(([lvl, roleId]) => `Level **${lvl}** → <@&${roleId}>`).join('\n')
        : '`Keine eingerichtet`';

    const ignoredChannels = cfg.ignoredChannels ?? [];
    const ignoredRoles = cfg.ignoredRoles ?? [];
    const ignoredChValue = ignoredChannels.length > 0 ? ignoredChannels.map(id => `<#${id}>`).join(',') : '`Keine`';
    const ignoredRoValue = ignoredRoles.length > 0 ? ignoredRoles.map(id => `<@&${id}>`).join(',') : '`Keine`';

    return new EmbedBuilder()
        .setTitle('⚡ Leveling-Dashboard')
        .setDescription(`Verwalte die Leveling-Einstellungen für **${guild.name}**.\nWähle unten eine Option, um eine Einstellung zu ändern.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Level-up-Kanal', value: channel, inline: true },
            { name: 'Systemstatus', value: cfg.enabled ? '**Aktiviert**' : '**Deaktiviert**', inline: true },
            { name: 'Ankündigungen', value: cfg.announceLevelUp !== false ? '**Aktiviert**' : '**Deaktiviert**', inline: true },
            { name: 'XP pro Nachricht', value: `\`${xpMin} – ${xpMax}\``, inline: true },
            { name: 'XP-Cooldown', value: `\`${cooldown}s\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Level-up-Nachricht', value: msgPreview, inline: false },
            { name: 'Rollen-Belohnungen', value: rewardsValue, inline: false },
            { name: 'Ignorierte Kanäle', value: ignoredChValue, inline: true },
            { name: 'Ignorierte Rollen', value: ignoredRoValue, inline: true },
        )
        .setFooter({ text: 'Das Dashboard schließt sich nach 10 Minuten Inaktivität' })
        .setTimestamp();
}

function buildSelectMenu(guildId: string) {
    return new StringSelectMenuBuilder()
        .setCustomId(`level_cfg_${guildId}`)
        .setPlaceholder('Wähle eine Einstellung...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Level-up-Kanal ändern')
                .setDescription('Lege fest, in welchem Kanal Level-up-Benachrichtigungen gesendet werden')
                .setValue('channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Level-up-Nachricht bearbeiten')
                .setDescription('Passe die Nachricht an, die beim Level-up eines Nutzers erscheint')
                .setValue('message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('XP-Bereich festlegen')
                .setDescription('Lege die minimalen und maximalen XP pro Nachricht fest')
                .setValue('xp_range')
                .setEmoji('🎲'),
            new StringSelectMenuOptionBuilder()
                .setLabel('XP-Cooldown festlegen')
                .setDescription('Sekunden zwischen XP-Vergaben für denselben Nutzer')
                .setValue('xp_cooldown')
                .setEmoji('⏱️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Rollen-Belohnung hinzufügen')
                .setDescription('Vergib eine Rolle, wenn ein Nutzer ein bestimmtes Level erreicht')
                .setValue('role_reward_add')
                .setEmoji('🏆'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Rollen-Belohnung entfernen')
                .setDescription('Entferne die Rollen-Belohnung eines bestimmten Levels')
                .setValue('role_reward_remove')
                .setEmoji('\ud83d\uddd1\ufe0f'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Ignorierte Kanäle')
                .setDescription('Kanäle umschalten, in denen keine XP vergeben werden')
                .setValue('ignore_channels')
                .setEmoji('\ud83d\udeab'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Ignorierte Rollen')
                .setDescription('Rollen umschalten, die keine XP erhalten')
                .setValue('ignore_roles')
                .setEmoji('\ud83d\udeab'),
        );
}

function buildButtonRow(cfg: GuildLevelingConfig, guildId: string, disabled = false) {
    const announceOn = cfg.announceLevelUp !== false;
    const systemOn = cfg.enabled !== false;
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_announce_${guildId}`)
            .setLabel('Ankündigungen')
            .setStyle(announceOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('📣')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_system_${guildId}`)
            .setLabel('Leveling')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('⚡')
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(cfg, rootInteraction.guild!)],
        components: [
            buildButtonRow(cfg, guildId),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild!.id;
            const cfg = await getLevelingConfig(client, guildId);

            if (!cfg.configured) {
                throw new NexoBotError(
                    'Leveling system not configured',
                    ErrorTypes.CONFIGURATION,
                    'Das Leveling-System ist noch nicht eingerichtet. Führe zuerst `/level setup` aus.',
                );
            }

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(cfg, interaction.guild!)],
                components: [
                    buildButtonRow(cfg, guildId),
                    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildSelectMenu(guildId)),
                ],
                selectMenuId: `level_cfg_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `level_cfg_toggle_announce_${guildId}` ||
                    customId === `level_cfg_toggle_system_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'channel':
                            await handleChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'message':
                            await handleMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'xp_range':
                            await handleXpRange(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'xp_cooldown':
                            await handleXpCooldown(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'role_reward_add':
                            await handleRoleRewardAdd(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'role_reward_remove':
                            await handleRoleRewardRemove(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'ignore_channels':
                            await handleIgnoreChannels(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'ignore_roles':
                            await handleIgnoreRoles(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    await btnInteraction.deferUpdate().catch(() => null);
                    const isAnnounce = btnInteraction.customId === `level_cfg_toggle_announce_${guildId}`;

                    if (isAnnounce) {
                        cfg.announceLevelUp = cfg.announceLevelUp === false;
                        await saveLevelingConfig(client, guildId, cfg);
                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ Ankündigungen aktualisiert',
                                    `Level-up-Ankündigungen sind jetzt **${cfg.announceLevelUp ? 'aktiviert' : 'deaktiviert'}**.`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        const wasEnabled = cfg.enabled !== false;
                        cfg.enabled = !wasEnabled;
                        await saveLevelingConfig(client, guildId, cfg);
                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ System aktualisiert',
                                    `Das Leveling-System ist jetzt **${cfg.enabled ? 'aktiviert' : 'deaktiviert'}**.${!cfg.enabled ? '\nNutzer erhalten keine XP, bis das System wieder aktiviert wird.' : ''}`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    await refreshDashboard(interaction, cfg, guildId);
                },
            });
        } catch (error) {
            if (error instanceof NexoBotError) throw error;
            logger.error('Unexpected error in level_dashboard:', error);
            throw new NexoBotError(
                `Level dashboard failed: ${error instanceof Error ? error.message : String(error)}`,
                ErrorTypes.UNKNOWN,
                'Das Leveling-Dashboard konnte nicht geöffnet werden.',
            );
        }
    },
} satisfies SubcommandModule & { prefixOnly: boolean };

async function handleRoleRewardAdd(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_role_reward_add_${guildId}`)
        .setTitle('🏆 Rollen-Belohnung hinzufügen');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('reward_role')
        .setPlaceholder('Wähle eine Rolle als Belohnung...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Belohnungsrolle')
        .setDescription('Diese Rolle erhält der Nutzer, wenn er das Level erreicht')
        .setRoleSelectMenuComponent(roleSelect);

    const levelInput = new TextInputBuilder()
        .setCustomId('reward_level')
        .setLabel('Benötigtes Level (1–500)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10')
        .setMaxLength(3)
        .setMinLength(1)
        .setRequired(true);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(levelInput));

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_role_reward_add_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawLevel = submitted.fields.getTextInputValue('reward_level').trim();
    const level = parseInt(rawLevel, 10);

    if (isNaN(level) || level < 1 || level > 500) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Das Level muss eine ganze Zahl zwischen **1** und **500** sein.' });
        return;
    }

    const roleId = (submitted.fields.getField('reward_role') as SelectMenuModalData).values[0];

    cfg.roleRewards = cfg.roleRewards ?? {};
    cfg.roleRewards[level] = roleId;
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Rollen-Belohnung hinzugefügt', `<@&${roleId}> wird jetzt ab Level **${level}** vergeben.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleRoleRewardRemove(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string, client: NexoClient) {
    const rewards = cfg.roleRewards ?? {};
    const entries = Object.entries(rewards).sort(([a], [b]) => Number(a) - Number(b));

    if (entries.length === 0) {
        await selectInteraction.deferUpdate();
        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: 'Es sind keine Rollen-Belohnungen eingerichtet, die entfernt werden können.',
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_role_reward_remove_${guildId}`)
        .setTitle('🗑️ Rollen-Belohnung entfernen');

    const infoInput = new TextInputBuilder()
        .setCustomId('current_rewards')
        .setLabel('Aktuelle Belohnungen (nur lesen)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(entries.map(([lvl, roleId]) => `Level ${lvl}: <@&${roleId}>`).join('\n'))
        .setRequired(false);

    const levelInput = new TextInputBuilder()
        .setCustomId('remove_level')
        .setLabel('Level, dessen Belohnung entfernt wird')
        .setStyle(TextInputStyle.Short)
        .setValue(entries[0][0])
        .setMaxLength(3)
        .setMinLength(1)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(infoInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(levelInput),
    );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_role_reward_remove_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawLevel = submitted.fields.getTextInputValue('remove_level').trim();
    const level = parseInt(rawLevel, 10);

    if (isNaN(level) || !cfg.roleRewards?.[level]) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: `Für Level **${rawLevel}** ist keine Rollen-Belohnung eingerichtet.` });
        return;
    }

    delete cfg.roleRewards[level];
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('Rollen-Belohnung entfernt', `Die Rollen-Belohnung für Level **${level}** wurde entfernt.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleChannel(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_channel_modal_${guildId}`)
        .setTitle('\ud83d\udce2 Level-up-Kanal ändern');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('levelup_channel')
        .setPlaceholder('Wähle einen Textkanal...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Level-up-Kanal')
        .setDescription('Kanal, in dem Level-up-Benachrichtigungen gesendet werden')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_channel_modal_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const channelId = (submitted.fields.getField('levelup_channel') as SelectMenuModalData).values[0];
    const channel = selectInteraction.guild!.channels.cache.get(channelId);

    if (channel && !botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
        await replyUserError(submitted, { type: ErrorTypes.PERMISSION, message: `Ich brauche die Berechtigungen **Nachrichten senden** und **Links einbetten** in ${channel}, um Level-up-Benachrichtigungen zu senden.` });
        return;
    }

    cfg.levelUpChannel = channelId;
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('\u2705 Kanal aktualisiert', `Level-up-Benachrichtigungen werden jetzt in ${channel ??`<#${channelId}>`} gesendet.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleIgnoreChannels(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_ignore_channels_${guildId}`)
        .setTitle('\ud83d\udeab Ignorierte Kanäle');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ignore_channel')
        .setPlaceholder('Wähle Kanäle zum Umschalten...')
        .setMinValues(1)
        .setMaxValues(10)
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Ignorierte Kanäle umschalten')
        .setDescription('Ausgewählte Kanäle werden umgeschaltet – in ignorierten Kanälen gibt es keine XP')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_ignore_channels_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const selectedIds = (submitted.fields.getField('ignore_channel') as SelectMenuModalData).values;
    const ignoreSet = new Set(cfg.ignoredChannels ?? []);

    for (const id of selectedIds) {
        if (ignoreSet.has(id)) {
            ignoreSet.delete(id);
        } else {
            ignoreSet.add(id);
        }
    }

    cfg.ignoredChannels = Array.from(ignoreSet);
    await saveLevelingConfig(client, guildId, cfg);

    const list = cfg.ignoredChannels.length > 0
        ? cfg.ignoredChannels.map(id => `<#${id}>`).join(',')
        : '`Keine`';

    await submitted.reply({
        embeds: [successEmbed('\u2705 Ignorierte Kanäle aktualisiert', `In diesen Kanälen gibt es keine XP: ${list}`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleIgnoreRoles(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId(`level_cfg_ignore_roles_${guildId}`)
        .setTitle('\ud83d\udeab Ignorierte Rollen');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('ignore_role')
        .setPlaceholder('Wähle Rollen zum Umschalten...')
        .setMinValues(1)
        .setMaxValues(10)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Ignorierte Rollen umschalten')
        .setDescription('Ausgewählte Rollen werden umgeschaltet – Mitglieder mit ignorierten Rollen erhalten keine XP')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `level_cfg_ignore_roles_${guildId}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const selectedIds = (submitted.fields.getField('ignore_role') as SelectMenuModalData).values;
    const ignoreSet = new Set(cfg.ignoredRoles ?? []);

    for (const id of selectedIds) {
        if (ignoreSet.has(id)) {
            ignoreSet.delete(id);
        } else {
            ignoreSet.add(id);
        }
    }

    cfg.ignoredRoles = Array.from(ignoreSet);
    await saveLevelingConfig(client, guildId, cfg);

    const list = cfg.ignoredRoles.length > 0
        ? cfg.ignoredRoles.map(id => `<@&${id}>`).join(',')
        : '`Keine`';

    await submitted.reply({
        embeds: [successEmbed('\u2705 Ignorierte Rollen aktualisiert', `Diese Rollen erhalten keine XP: ${list}`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleMessage(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_message')
        .setTitle('💬 Level-up-Nachricht bearbeiten')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Nachricht ({user} und {level} möglich)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.levelUpMessage || '{user} ist auf Level {level} aufgestiegen!')
                    .setMaxLength(500)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('{user} ist auf Level {level} aufgestiegen!'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields.getTextInputValue('message_input').trim();

    if (!newMessage.includes('{user}') && !newMessage.includes('{level}')) {
        logger.warn(
            `Level-up message set without {user} or {level} placeholders in guild ${guildId}`,
        );
    }

    cfg.levelUpMessage = newMessage;
    await saveLevelingConfig(client, guildId, cfg);

    const preview = newMessage.replace('{user}', '@Nutzer').replace('{level}', '5');

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Nachricht aktualisiert',
                `Level-up-Nachricht gespeichert.\n**Vorschau:** ${preview}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleXpRange(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string, client: NexoClient) {
    const currentMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const currentMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 25;

    const modal = new ModalBuilder()
        .setCustomId('level_cfg_xp_range')
        .setTitle('XP-Bereich pro Nachricht festlegen')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_min_input')
                    .setLabel('Minimale XP (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMin))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('15'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_max_input')
                    .setLabel('Maximale XP (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMax))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('25'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_xp_range' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawMin = submitted.fields.getTextInputValue('xp_min_input').trim();
    const rawMax = submitted.fields.getTextInputValue('xp_max_input').trim();
    const newMin = parseInt(rawMin, 10);
    const newMax = parseInt(rawMax, 10);

    if (isNaN(newMin) || isNaN(newMax) || newMin < 1 || newMax < 1 || newMin > 500 || newMax > 500) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Beide XP-Werte müssen ganze Zahlen zwischen **1** und **500** sein.' });
        return;
    }

    if (newMin > newMax) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Die minimalen XP dürfen nicht größer sein als die maximalen XP.' });
        return;
    }

    cfg.xpRange = { min: newMin, max: newMax };
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ XP-Bereich aktualisiert',
                `Nutzer erhalten jetzt zwischen **${newMin}** und **${newMax}** XP pro Nachricht.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleXpCooldown(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, cfg: GuildLevelingConfig, guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_cooldown')
        .setTitle('⏱️ XP-Cooldown festlegen')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('cooldown_input')
                    .setLabel('Cooldown in Sekunden (0–3600)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(cfg.xpCooldown ?? 60))
                    .setMaxLength(4)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('60'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_cooldown' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields.getTextInputValue('cooldown_input').trim();
    const newCooldown = parseInt(raw, 10);

    if (isNaN(newCooldown) || newCooldown < 0 || newCooldown > 3600) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Der Cooldown muss eine ganze Zahl zwischen **0** und **3600** Sekunden sein.' });
        return;
    }

    cfg.xpCooldown = newCooldown;
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Cooldown aktualisiert',
                `XP-Cooldown auf **${newCooldown} Sekunde${newCooldown !== 1 ? 'n' : ''}** gesetzt.${newCooldown === 0 ? '\n> ⚠️ Bei einem Cooldown von 0 gibt es für jede Nachricht XP.' : ''}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}
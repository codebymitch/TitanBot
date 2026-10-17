import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
} from 'discord.js';
import type {
    ButtonInteraction,
    ChatInputCommandInteraction,
    DMChannel,
    Guild,
    MessageComponentInteraction,
    ModalSubmitInteraction,
    SelectMenuModalData,
    StringSelectMenuInteraction,
} from 'discord.js';
import type { Command, GuildConfig, NexoClient } from '../../types/index.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';

type WizardAnswer = { cancelled: true; answer?: undefined } | { answer: string; cancelled?: undefined };

interface WizardPrompt {
    key: string;
    skipMessage: string;
    question: string;
    /** undefined = skip, null = clear */
    parse(answer: string): Promise<string | null | undefined>;
}

const DASHBOARD_CUSTOM_ID = 'config_select';
const WIZARD_BUTTON_ID = 'config_wizard';
const activeWizardSessions = new Set<string>();

const DM_DISABLED_HELP = [
    '1. Rechtsklick auf den Servernamen (mobil: oben auf den Servernamen tippen).',
    '2. Öffne die **Privatsphäre-Einstellungen**.',
    '3. Aktiviere **Direktnachrichten von Servermitgliedern erlauben**.',
    '4. Klicke erneut auf **Einrichtung starten**.',
].join('\n');

async function notifyWizardStarted(buttonInteraction: ButtonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'Einrichtung gestartet',
            'Schau in deine DMs — dort findest du die erste Frage zur Einrichtung.\n\nBeantworte jede Frage in dieser DM. Schreib `skip`, um den aktuellen Wert zu behalten.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction: ButtonInteraction) {
    await replyUserError(buttonInteraction, {
        type: ErrorTypes.USER_INPUT,
        message: `Ich konnte dir keine DM schicken. Erlaube DMs von diesem Server und versuch es dann erneut.\n\n${DM_DISABLED_HELP}`,
    }).catch(() => {});
}

function formatChannelMention(guild: Guild, channelId: string | null | undefined) {
    if (!channelId) {
        return '`Nicht festgelegt`';
    }
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild: Guild, roleId: string | null | undefined) {
    if (!roleId) {
        return '`Nicht festgelegt`';
    }
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`Nicht konfiguriert`';
    }

    const typeLabels = ['Spielt', 'Streamt', 'Hört', 'Schaut', '', 'Tritt an in'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 Primär \`${colors.primary}\` · Erfolg \`${colors.success}\``,
        `⚠️ Warnung \`${colors.warning}\` · Fehler \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config: GuildConfig, guild: Guild) {
    const setupDone = config.setupWizardCompleted;

    return createEmbed({
        title: '⚙️ Server-Konfiguration',
        description: `Grundeinstellungen für **${guild.name}**. Wähle unten eine Option oder starte die Einrichtung.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ Server-Prefix',
                value: `\`${config.prefix || getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ Moderator-Rolle',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 Log-Kanal',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '💚 Bot-Status',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 Embed-Design',
                value: `${getThemeColorLines()}\n-# Die Farben werden in der Bot-Konfiguration festgelegt und gelten global.`,
                inline: false,
            },
            {
                name: '⚡ Command-Zugriff',
                value: 'Mit `/commands dashboard` aktivierst oder deaktivierst du Commands und Subcommands.',
                inline: false,
            },
            {
                name: `${setupDone ? '✅' : '📝'} Einrichtung`,
                value: setupDone
                    ? 'Einrichtung abgeschlossen — du kannst sie jederzeit erneut starten, um Einstellungen zu ändern.'
                    : 'Starte die Einrichtung, um deinen Server schnell zu konfigurieren.',
                inline: false,
            },
        ],
        footer: 'Das Dashboard schließt sich nach 10 Minuten Inaktivität',
    });
}

function buildSettingsSelect(guildId: string) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Einstellung zum Bearbeiten auswählen...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Server-Prefix')
                    .setDescription('Prefix für Text-Commands ändern')
                    .setValue('prefix')
                    .setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Moderator-Rolle')
                    .setDescription('Rolle für Moderations-Commands')
                    .setValue('modRole')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Log-Kanal')
                    .setDescription('Kanal für System-Log-Nachrichten')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config: GuildConfig, guildId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(config.setupWizardCompleted ? 'Einrichtung erneut starten' : 'Einrichtung starten')
            .setEmoji('📝')
            .setStyle(config.setupWizardCompleted ? ButtonStyle.Secondary : ButtonStyle.Success),
    );
}

function extractId(value: unknown) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/<#!?(\d{17,19})>/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/<@&(\d{17,19})>/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmChannel: DMChannel, userId: string, prompt: string, stepNumber: number, totalSteps: number): Promise<WizardAnswer | null> {
    await dmChannel.send({
        embeds: [createEmbed({
            title: `Einrichtung – Frage ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmChannel.awaitMessages({
        filter: (message) => message.author.id === userId && !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmChannel.send({
            embeds: [buildUserErrorEmbed(ErrorTypes.RATE_LIMIT, 'Du hast nicht rechtzeitig geantwortet. Starte die Einrichtung erneut, wenn du so weit bist.')],
        });
        return null;
    }

    const answer = collected.first()!.content.trim();
    if (answer.toLowerCase() === 'cancel') {
        await dmChannel.send({
            embeds: [infoEmbed('Einrichtung abgebrochen', 'Die Einrichtung wurde beendet. Deine bereits gespeicherten Antworten bleiben übernommen.')],
        });
        return { cancelled: true };
    }

    return { answer };
}

function formatSavedAck(key: string, value: string | null, guild: Guild) {
    if (key === 'prefix') {
        return `Server-Prefix gespeichert: \`${value}\`.`;
    }

    if (key === 'logChannelId') {
        if (value === null) {
            return 'Log-Kanal entfernt.';
        }
        const channel = guild.channels.cache.get(value);
        return `Log-Kanal gespeichert: ${channel ?? `<#${value}>`}.`;
    }

    if (key === 'modRole') {
        if (value === null) {
            return 'Moderator-Rolle entfernt.';
        }
        const role = guild.roles.cache.get(value);
        return `Moderator-Rolle gespeichert: ${role ?? `<@&${value}>`}.`;
    }

    return 'Einstellung gespeichert.';
}

async function validateGuildChannelId(guild: Guild, channelId: string) {
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error('Dieser Kanal wurde auf diesem Server nicht gefunden oder ist kein Textkanal.');
    }
    return channel.id;
}

async function validateGuildRoleId(guild: Guild, roleId: string) {
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw new Error('Diese Rolle wurde auf diesem Server nicht gefunden.');
    }
    return role.id;
}

async function refreshDashboard(rootInteraction: ChatInputCommandInteraction, config: GuildConfig, guild: Guild) {
    const embed = buildDashboardEmbed(config, guild);
    const components = [buildButtonRow(config, guild.id), buildSettingsSelect(guild.id)];
    await InteractionHelper.safeEditReply(rootInteraction, { embeds: [embed], components }).catch(() => {});
}

async function runSetupWizard(buttonInteraction: ButtonInteraction, config: GuildConfig, guild: Guild, client: NexoClient, rootInteraction: ChatInputCommandInteraction) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [warningEmbed('Einrichtung läuft bereits', 'Du hast bereits eine Einrichtung in deinen DMs offen. Antworte dort, um weiterzumachen, oder schreib `cancel`, um sie zu beenden.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    activeWizardSessions.add(user.id);

    let dmChannel: DMChannel | undefined;

    try {
        dmChannel = await user.createDM();
    } catch (error) {
        logger.warn('Failed to create DM channel for setup wizard', { userId: user.id, error: (error as Error).message });
        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmChannel) {
            activeWizardSessions.delete(user.id);
        }
    }

    const prompts: WizardPrompt[] = [
        {
            key: 'prefix',
            skipMessage: 'Der aktuelle Server-Prefix bleibt.',
            question: 'Welchen Command-Prefix soll dieser Server nutzen?\nAktuell: `' + (config.prefix || getCommandPrefix()) + '`\nAntworte mit `skip`, um ihn zu behalten, oder `cancel`, um abzubrechen.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (/\s/.test(normalized) || normalized.length < 1 || normalized.length > 10) {
                    throw new Error('Der Prefix muss 1–10 Zeichen lang sein und darf keine Leerzeichen enthalten.');
                }
                return normalized;
            },
        },
        {
            key: 'logChannelId',
            skipMessage: 'Der aktuelle Log-Kanal bleibt.',
            question: 'In welchen Kanal sollen die Bot-Logs gehen?\nSchick eine Kanal-Erwähnung oder Kanal-ID, `none` zum Entfernen, `skip` zum Behalten oder `cancel` zum Abbrechen.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Gib eine gültige Kanal-Erwähnung oder Kanal-ID von diesem Server an.');
                return validateGuildChannelId(guild, id);
            },
        },
        {
            key: 'modRole',
            skipMessage: 'Die aktuelle Moderator-Rolle bleibt.',
            question: 'Welche Rolle sollen Moderatoren haben?\nSchick eine Rollen-Erwähnung oder Rollen-ID, `none` zum Entfernen, `skip` zum Behalten oder `cancel` zum Abbrechen.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Gib eine gültige Rollen-Erwähnung oder Rollen-ID von diesem Server an.');
                return validateGuildRoleId(guild, id);
            },
        },
    ];

    const changes: Record<string, string | null> = {};
    const errors: string[] = [];
    let wizardCancelled = false;

    try {
        try {
            await dmChannel.send({
                embeds: [createEmbed({
                    title: '📝 Einrichtung',
                    description: 'Beantworte jede Frage in dieser DM.\n\n• Schreib `skip`, um den aktuellen Wert zu behalten\n• Schreib `cancel`, um die Einrichtung abzubrechen',
                    color: 'info',
                })],
            });
        } catch (error) {
            logger.warn('Failed to send setup wizard DM', { userId: user.id, error: (error as Error).message });
            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmChannel,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                if (result.cancelled) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                try {
                    const value = await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmChannel.send({
                            embeds: [infoEmbed('Übersprungen', prompt.skipMessage)],
                        });
                    } else {
                        await ConfigService.updateSetting(client, guild.id, prompt.key, value, user.id);
                        changes[prompt.key] = value;
                        await dmChannel.send({
                            embeds: [successEmbed('Gespeichert', formatSavedAck(prompt.key, value, guild))],
                        });

                        try {
                            const updatedConfig = await getGuildConfig(client, guild.id);
                            await refreshDashboard(rootInteraction, updatedConfig, guild);
                        } catch (refreshError) {
                            logger.debug('Failed to refresh dashboard during setup wizard', { error: (refreshError as Error).message });
                        }
                    }

                    answered = true;
                } catch (error) {
                    errors.push(`• ${prompt.key}: ${(error as Error).message}`);
                    await dmChannel.send({
                        embeds: [buildUserErrorEmbed(ErrorTypes.VALIDATION, `${(error as Error).message}\n\nBitte antworte erneut mit einer gültigen Antwort, \`skip\` oder \`cancel\`.`)],
                    });
                }
            }

            if (wizardCancelled) {
                break;
            }
        }

        if (!wizardCancelled) {
            try {
                await setConfigValue(client, guild.id, 'setupWizardCompleted', true);
            } catch (error) {
                logger.warn('Failed to persist setupWizardCompleted flag', { guildId: guild.id, error: (error as Error).message });
            }
        }

        const summaryTitle = wizardCancelled
            ? (Object.keys(changes).length > 0 ? 'Einrichtung beendet' : 'Einrichtung abgebrochen')
            : (errors.length > 0 ? 'Einrichtung abgeschlossen' : 'Einrichtung abgeschlossen');

        const summaryBody = wizardCancelled
            ? (Object.keys(changes).length > 0
                ? `Einrichtung vorzeitig beendet. Bis dahin wurden **${Object.keys(changes).length}** Einstellung(en) gespeichert.`
                : 'Die Einrichtung wurde beendet, bevor Änderungen gespeichert wurden.')
            : (Object.keys(changes).length > 0
                ? `**${Object.keys(changes).length}** Einstellung(en) aktualisiert.${errors.length > 0 ? ' Einige Antworten mussten wiederholt werden.' : ''}`
                : 'Es wurden keine Änderungen übernommen.');

        const summaryEmbed = createEmbed({
            title: wizardCancelled ? `⚠️ ${summaryTitle}` : `✅ ${summaryTitle}`,
            description: summaryBody,
            color: wizardCancelled ? 'warning' : (errors.length > 0 ? 'warning' : 'success'),
        });

        if (errors.length > 0) {
            const uniqueErrors = [...new Set(errors)];
            summaryEmbed.addFields({ name: 'Probleme', value: uniqueErrors.join('\n').slice(0, 1024) });
        }

        await dmChannel.send({ embeds: [summaryEmbed] });

        try {
            const updatedConfig = await getGuildConfig(client, guild.id);
            await refreshDashboard(rootInteraction, updatedConfig, guild);
        } catch (error) {
            logger.debug('Failed to refresh dashboard after wizard completion', { error: (error as Error).message });
        }
    } finally {
        activeWizardSessions.delete(user.id);
    }
}

async function showSettingModal(selectInteraction: StringSelectMenuInteraction, guildId: string, setting: string) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 Log-Kanal ändern');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('Textkanal auswählen...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('Log-Kanal')
            .setDescription('Kanal, in den System-Log-Nachrichten gesendet werden')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ Moderator-Rolle ändern');

        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mod_role')
            .setPlaceholder('Moderator-Rolle auswählen...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const roleLabel = new LabelBuilder()
            .setLabel('Moderator-Rolle')
            .setDescription('Rolle für Moderations-Commands')
            .setRoleSelectMenuComponent(roleSelect);

        modal.addLabelComponents(roleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('Server-Prefix ändern');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('Neuer Prefix (1–10 Zeichen, ohne Leerzeichen)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(setting: string, submitted: ModalSubmitInteraction) {
    if (setting === 'logChannelId') {
        const channelId = (submitted.fields.getField('log_channel') as SelectMenuModalData)?.values?.[0];
        if (!channelId) {
            throw new Error('Bitte wähle einen Log-Kanal aus.');
        }
        return channelId;
    }

    if (setting === 'modRole') {
        const roleId = (submitted.fields.getField('mod_role') as SelectMenuModalData)?.values?.[0];
        if (!roleId) {
            throw new Error('Bitte wähle eine Moderator-Rolle aus.');
        }
        return roleId;
    }

    const prefix = submitted.fields.getTextInputValue('value')?.trim();
    if (!prefix || prefix.length < 1 || prefix.length > 10 || /\s/.test(prefix)) {
        throw new Error('Der Prefix muss 1–10 Zeichen lang sein und darf keine Leerzeichen enthalten.');
    }
    return prefix;
}

function buildSettingSuccessMessage(setting: string, value: string, guild: Guild) {
    if (setting === 'logChannelId') {
        const channel = guild.channels.cache.get(value);
        return `Log-Kanal festgelegt: ${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'modRole') {
        const role = guild.roles.cache.get(value);
        return `Moderator-Rolle festgelegt: ${role ?? `<@&${value}>`}.`;
    }

    return `Server-Prefix festgelegt: \`${value}\`.`;
}

async function handleSettingModalSubmit(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, setting: string, guildId: string, client: NexoClient) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        const value = resolveSettingModalValue(setting, submitted);
        await ConfigService.updateSetting(client, guildId, setting, value, submitted.user.id);

        await submitted.reply({
            embeds: [successEmbed('Konfiguration aktualisiert', buildSettingSuccessMessage(setting, value, submitted.guild!))],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild!);
    } catch (error) {
        logger.error('Config wizard modal submit error:', error);
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: (error as Error).message || 'Bitte versuch es erneut.',
        }).catch(() => {});
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('configwizard')
        .setDescription('Öffnet das Konfigurations-Dashboard und die Einrichtung des Servers')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'Core',

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                return;
            }

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'Du brauchst die Berechtigung **Server verwalten**, um diesen Command zu nutzen.',
                });
            }

            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId!);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild!);
            const components = [buildButtonRow(guildConfig, interaction.guildId!), buildSettingsSelect(interaction.guildId!)];

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) {
                return;
            }

            const collectorFilter = (componentInteraction: MessageComponentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId.includes(`:${interaction.guildId}`);

            const componentCollector = replyMessage.createMessageComponentCollector({
                filter: collectorFilter,
                time: 600_000,
            });

            componentCollector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isButton()) {
                        await componentInteraction.deferUpdate();

                        if (componentInteraction.customId.startsWith(`${WIZARD_BUTTON_ID}:`)) {
                            const latestConfig = await getGuildConfig(interaction.client, interaction.guildId!);
                            await runSetupWizard(componentInteraction, latestConfig, interaction.guild!, interaction.client, interaction);
                        }
                        return;
                    }

                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        await showSettingModal(componentInteraction, interaction.guildId!, selected);
                        await handleSettingModalSubmit(
                            componentInteraction,
                            interaction,
                            selected,
                            interaction.guildId!,
                            interaction.client,
                        );
                    }
                } catch (error) {
                    logger.error('Config dashboard interaction error:', error);
                    await replyUserError(componentInteraction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Deine Auswahl konnte nicht verarbeitet werden. Bitte versuch es erneut.',
                    }).catch(() => {});
                }
            });
        } catch (error) {
            logger.error('Config command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'Das Konfigurations-Dashboard konnte nicht geöffnet werden. Bitte versuch es erneut.',
            });
        }
    },
} satisfies Command;

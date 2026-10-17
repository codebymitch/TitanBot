import { getColor, getDefaultApplicationQuestions, botConfig } from '../../../config/bot.js';
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
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import type {
    ChatInputCommandInteraction,
    Guild,
    ModalSubmitInteraction,
    SelectMenuModalData,
    StringSelectMenuInteraction,
} from 'discord.js';
import type { GuildConfig, NexoClient } from '../../../types/index.js';
import type { ApplicationRole, ApplicationSettings } from '../../../utils/database.js';
import type { ErrorLike } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplicationRoleSettings,
    getApplications,
    deleteApplication,
} from '../../../utils/database.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { setLogChannel, resolveApplicationLogChannel, resolveLogChannel } from '../../../services/loggingService.js';

/** The dashboard is opened from the /app-admin slash command or from the setup modal submit. */
export type AppDashboardInteraction = ChatInputCommandInteraction | ModalSubmitInteraction;

/** `managerRoles` is stored in the settings record but not declared on ApplicationSettings. */
type ManagerRoles = string[] | undefined;

async function buildDashboardEmbed(settings: ApplicationSettings, roles: ApplicationRole[], guild: Guild, client: NexoClient) {
    const guildConfig = await getGuildConfig(client, guild.id);
    const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;
    const logChannel = applicationsChannel ? `<#${applicationsChannel}>` : '`Nicht festgelegt`';
    const managerRoles = settings.managerRoles as ManagerRoles;
    const managerRoleList =
        (managerRoles?.length ?? 0) > 0
            ? managerRoles!.map(id => `<@&${id}>`).join(',')
            : '`Keine eingerichtet`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> — ${r.name}`).join('\n')
            : '`Keine Bewerbungsrollen eingerichtet`';
    const questionCount = settings.questions?.length ?? 0;
    const firstQ =
        settings.questions?.[0]
            ? `\`${settings.questions[0].length > 55 ? settings.questions[0].substring(0, 55) + '…' : settings.questions[0]}\``
            : '`Nicht festgelegt`';

    return new EmbedBuilder()
        .setTitle('Bewerbungs-Dashboard')
        .setDescription(`Verwalte die Bewerbungseinstellungen für **${guild.name}**.\nWähle unten eine Option, um eine Einstellung zu ändern.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Bewerbungsstatus', value: settings.enabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Log-Kanal', value: logChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Manager-Rollen', value: managerRoleList, inline: false },
            { name: 'Fragen', value: `${questionCount} eingerichtet — erste: ${firstQ}`, inline: false },
            { name: 'Bewerbungsrollen', value: roleList, inline: false },
            {
                name: 'Aufbewahrung',
                value: `Offen: **${settings.pendingApplicationRetentionDays ?? 30} T.** · Geprüft: **${settings.reviewedApplicationRetentionDays ?? 14} T.**`,
                inline: false,
            },
        )
        .setFooter({ text: 'Das Dashboard schließt sich nach 15 Minuten Inaktivität' })
        .setTimestamp();
}

function buildSelectMenu(guildId: string) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('Einstellung zum Konfigurieren auswählen...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Log-Kanal')
                .setDescription('Kanal festlegen, in dem neue Bewerbungen geloggt werden')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Manager-Rollen')
                .setDescription('Rolle hinzufügen oder entfernen, die Bewerbungen verwalten darf')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Fragen bearbeiten')
                .setDescription('Fragen im Bewerbungsformular anpassen')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bewerbungsrolle hinzufügen')
                .setDescription('Rolle hinzufügen, auf die sich Mitglieder bewerben können')
                .setValue('role_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bewerbungsrolle entfernen')
                .setDescription('Rolle aus der Bewerbungsliste entfernen')
                .setValue('role_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Aufbewahrungsdauer')
                .setDescription('Festlegen, wie lange offene und geprüfte Bewerbungen gespeichert werden')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(settings: ApplicationSettings, guildId: string, disabled = false) {
    const systemOn = settings.enabled === true;
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('Bewerbungen')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(settings, roles, rootInteraction.guild!, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,
    async execute(interaction: AppDashboardInteraction, config: GuildConfig | null, client: NexoClient, selectedAppName: string | null = null) {
        try {
            const guildId = interaction.guild!.id;

            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRoles(client, guildId),
            ]);

            const guildConfig = await getGuildConfig(client, guildId);
            const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;

            const isCompletelyUnconfigured = 
                !applicationsChannel && 
                !settings.enabled && 
                ((settings.managerRoles as ManagerRoles)?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new NexoBotError(
                    'Applications system not set up',
                    ErrorTypes.CONFIGURATION,
                    'Das Bewerbungssystem ist noch nicht eingerichtet. Nutze `/app-admin setup`, um deine erste Bewerbung zu erstellen.',
                );
            }

            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            if (selectedAppName) {
                const selectedRole = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRole) {
                    await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
                    return;
                }
                
            }

            const defaultRole = roles[0];
            await showApplicationDashboard(interaction, defaultRole, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof NexoBotError) throw error;
            logger.error('Unexpected error in app_dashboard:', error);
            throw new NexoBotError(
                `Applications dashboard failed: ${(error as Error).message}`,
                ErrorTypes.UNKNOWN,
                'Das Bewerbungs-Dashboard konnte nicht geöffnet werden.',
            );
        }
    },
};

async function showApplicationSelector(interaction: AppDashboardInteraction, roles: ApplicationRole[], settings: ApplicationSettings, guildId: string, client: NexoClient) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('Bewerbung zum Konfigurieren auswählen...')
        .addOptions(
            roles.map(role =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setDescription(`Bewerbung ${role.name} konfigurieren`)
                    .setValue(role.roleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('Bewerbung auswählen')
        .setDescription('Wähle, welche Bewerbungsrolle du konfigurieren möchtest.')
        .setColor(getColor('info'));

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
    });

    const collector = interaction.channel!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && i.customId === `app_select_${guildId}`,
        time: 600_000,
        max: 1,
    });

    collector.on('collect', async selectInteraction => {
        const deferred = await safeDeferInteraction(selectInteraction);
        if (!deferred) return;
        
        const selectedRoleId = selectInteraction.values[0];
        const selectedRole = roles.find(r => r.roleId === selectedRoleId);

        if (selectedRole) {
            await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'Es wurde nichts ausgewählt. Das Dashboard wurde geschlossen.',
            }).catch(() => {});
        }
    });
}

async function showGlobalDashboard(interaction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [await buildDashboardEmbed(settings, roles, interaction.guild!, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, settings, roles, guildId, client, null);
}

async function showApplicationDashboard(rootInteraction: AppDashboardInteraction, selectedRole: ApplicationRole, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient) {
    const roleObj = rootInteraction.guild!.roles.cache.get(selectedRole.roleId);

    const guildConfig = await getGuildConfig(client, guildId);
    const appSettings = await getApplicationRoleSettings(client, guildId, selectedRole.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = resolveApplicationLogChannel(guildConfig, appSettings, settings);
    const isEnabled = selectedRole.enabled !== false; 

    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`Übernimmt den globalen Log-Kanal`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`Übernimmt die globalen Fragen`';
    
    const managerRoles = settings.managerRoles as ManagerRoles;
    const managerRolesDisplay = managerRoles && managerRoles.length > 0
        ? managerRoles.map(id => `<@&${id}>`).join(',')
        : '`Keine eingerichtet`';

    const embed = new EmbedBuilder()
        .setTitle('📋 Bewerbungs-Dashboard')
        .setDescription(`Konfiguration für **${selectedRole.name}**`)
        .setColor(isEnabled ? getColor('success') : getColor('error'))
        .addFields(
            { 
                name: 'Rolle', 
                value: roleObj ? roleObj.toString() : `<@&${selectedRole.roleId}>`, 
                inline: true 
            },
            { 
                name: 'Bewerbungsstatus', 
                value: isEnabled ? '✅ **Aktiviert**' : '❌ **Deaktiviert**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: 'Fragen', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: 'Log-Kanal', 
                value: logChannelDisplay,
                inline: true 
            },
            { 
                name: 'Manager-Rollen',
                value: managerRolesDisplay,
                inline: true 
            },
            { 
                name: 'Aufbewahrungsdauer',
                value: `Offen: **${settings.pendingApplicationRetentionDays ?? 30} T.** · Geprüft: **${settings.reviewedApplicationRetentionDays ?? 14} T.**`,
                inline: false 
            },
        )
        .setFooter({ text: 'Das Dashboard schließt sich nach 10 Minuten Inaktivität' })
        .setTimestamp();

    const configMenu = buildApplicationSelectMenu(guildId, selectedRole.roleId);

    const controlButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRole.roleId}`)
            .setLabel(isEnabled ? 'Bewerbung deaktivieren' : 'Bewerbung aktivieren')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_delete_${selectedRole.roleId}`)
            .setLabel('Bewerbung löschen')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(configMenu);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRole.roleId);
}

function setupCollectors(interaction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient, selectedRoleId: string | null) {
    const customIdPrefix = selectedRoleId ? `app_cfg_${selectedRoleId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.channel!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRoleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }
            switch (selectedOption) {
                case 'log_channel':
                    await handleLogChannel(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'manager_role':
                    await handleManagerRole(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'questions':
                    await handleQuestions(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'role_add':
                    await handleRoleAdd(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'role_remove':
                    await handleRoleRemove(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'retention':
                    await handleRetention(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
            }
        } catch (error) {
            if (error instanceof NexoBotError) {
                logger.debug(`Applications config validation error: ${error.message}`);
            } else {
                logger.error('Unexpected applications dashboard error:', error);
            }

            const errorMessage =
                error instanceof NexoBotError
                    ? error.userMessage || 'Beim Verarbeiten deiner Auswahl ist ein Fehler aufgetreten.'
                    : 'Beim Aktualisieren der Konfiguration ist ein unerwarteter Fehler aufgetreten.';

            if (!selectInteraction.replied && !selectInteraction.deferred) {
                await safeDeferInteraction(selectInteraction);
            }

            await replyUserError(selectInteraction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage,
            }).catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('\u23f0 Dashboard abgelaufen')
                .setDescription('Dieses Dashboard wurde wegen Inaktivität geschlossen. Führe den Command erneut aus, um weiterzumachen.')
                .setColor(getColor('error'));
                
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });

    if (!selectedRoleId) {
        const globalToggleCollector = interaction.channel!.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_cfg_toggle_${guildId}`,
            time: 600_000,
        });

        globalToggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                const wasEnabled = settings.enabled === true;
                settings.enabled = !wasEnabled;

                await saveApplicationSettings(interaction.client, guildId, settings);

                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                const updatedRoles = await getApplicationRoles(interaction.client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRoles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 Bewerbungen deaktiviert' : '🟢 Bewerbungen aktiviert',
                        `Das Bewerbungssystem ist jetzt **${wasEnabled ? 'deaktiviert' : 'aktiviert'}**.\n\n${
                            wasEnabled 
                                ? 'Mitglieder können sich nicht mehr auf Rollen bewerben.' 
                                : 'Mitglieder können sich jetzt auf Rollen bewerben.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling global application status:', error);
                await replyUserError(toggleInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Beim Umschalten des Bewerbungsstatus ist ein Fehler aufgetreten.',
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration abgelaufen')
                    .setDescription('Diese Dashboard-Sitzung ist wegen Inaktivität abgelaufen (10 Minuten).\n\nFühre den Command erneut aus, um deine Bewerbungen weiter zu konfigurieren.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }

    if (selectedRoleId) {
        const btnCollector = interaction.channel!.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_delete_${selectedRoleId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            
            const appRoleForDelete = roles.find(r => r.roleId === selectedRoleId);
            const appNameForDelete = appRoleForDelete?.name ?? 'diese Bewerbung';

            const confirmModal = new ModalBuilder()
                .setCustomId('app_delete_confirm')
                .setTitle('Löschen der Bewerbung bestätigen');

            const deleteWarningText = new TextDisplayBuilder()
                .setContent(`⚠️ Du bist dabei, **${appNameForDelete}** endgültig zu löschen. Alle gespeicherten Bewerbungen und Einstellungen für diese Rolle werden entfernt und können nicht wiederhergestellt werden.`);

            const deleteCheckbox = new CheckboxBuilder()
                .setCustomId('confirm_delete')
                .setDefault(false);

            const deleteCheckboxLabel = new LabelBuilder()
                .setLabel('Ich bestätige – nicht rückgängig zu machen')
                .setCheckboxComponent(deleteCheckbox);

            confirmModal
                .addTextDisplayComponents(deleteWarningText)
                .addLabelComponents(deleteCheckboxLabel);

            try {
                await btnInteraction.showModal(confirmModal);
            } catch (error) {
                logger.error('Error showing delete confirmation modal:', error);
                await replyUserError(btnInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Das Bestätigungsfenster konnte nicht angezeigt werden. Bitte versuch es erneut.',
                }).catch(() => {});
                return;
            }

            try {
                const confirmSubmit = await btnInteraction.awaitModalSubmit({
                    time: 60_000,
                    filter: i =>
                        i.customId === 'app_delete_confirm' && i.user.id === btnInteraction.user.id,
                }).catch(() => null);

                if (!confirmSubmit) {
                    await replyUserError(btnInteraction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Das Löschen der Bewerbung wurde abgebrochen.',
                    });
                    return;
                }

                const confirmed = confirmSubmit.fields.getCheckbox('confirm_delete');
                if (!confirmed) {
                    await replyUserError(confirmSubmit, { type: ErrorTypes.VALIDATION, message: 'Du musst das Bestätigungskästchen anhaken, um die Bewerbung zu löschen.' });
                    return;
                }

                await handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client);
                collector.stop();
                btnCollector.stop();

            } catch (error) {
                logger.error('Error confirming application deletion:', error);
                await replyUserError(btnInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Beim Löschen der Bewerbung ist ein Fehler aufgetreten.',
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration abgelaufen')
                    .setDescription('Diese Dashboard-Sitzung ist wegen Inaktivität abgelaufen (10 Minuten).\n\nFühre den Command erneut aus, um deine Bewerbungen weiter zu konfigurieren.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });

        const toggleCollector = interaction.channel!.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_toggle_${selectedRoleId}`,
            time: 900_000,
        });

        toggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                
                const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
                if (roleIndex === -1) {
                    await replyUserError(toggleInteraction, {
                        type: ErrorTypes.USER_INPUT,
                        message: 'Bewerbungsrolle nicht gefunden.',
                    });
                    return;
                }

                const wasEnabled = roles[roleIndex].enabled !== false;
                roles[roleIndex].enabled = !wasEnabled;

                await saveApplicationRoles(interaction.client, guildId, roles);

                const updatedRole = roles[roleIndex];
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                await showApplicationDashboard(interaction, updatedRole, updatedSettings, roles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 Bewerbung deaktiviert' : '🟢 Bewerbung aktiviert',
                        `Die Bewerbung **${updatedRole.name}** ist jetzt **${wasEnabled ? 'deaktiviert' : 'aktiviert'}**.\n\n${
                            wasEnabled 
                                ? 'Diese Bewerbung erscheint nicht mehr in den Optionen von `/apply submit`.' 
                                : 'Diese Bewerbung erscheint jetzt in den Optionen von `/apply submit`.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling application status:', error);
                await replyUserError(toggleInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Beim Umschalten des Bewerbungsstatus ist ein Fehler aufgetreten.',
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration abgelaufen')
                    .setDescription('Diese Dashboard-Sitzung ist wegen Inaktivität abgelaufen (10 Minuten).\n\nFühre den Command erneut aus, um deine Bewerbungen weiter zu konfigurieren.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }
}

function buildApplicationSelectMenu(guildId: string, roleId: string) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${roleId}`)
        .setPlaceholder('Einstellung zum Konfigurieren auswählen...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Log-Kanal')
                .setDescription('Kanal festlegen, in dem Bewerbungen geloggt werden')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Manager-Rollen')
                .setDescription('Rolle hinzufügen oder entfernen, die Bewerbungen verwalten darf')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Fragen bearbeiten')
                .setDescription('Fragen im Bewerbungsformular anpassen')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Aufbewahrungsdauer')
                .setDescription('Festlegen, wie lange offene und geprüfte Bewerbungen gespeichert werden')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

async function handleLogChannel(selectInteraction: StringSelectMenuInteraction, rootInteraction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient, selectedRoleId: string | null) {
    let currentChannel = settings.logChannelId;
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentChannel = roleSettings.logChannelId || settings.logChannelId;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`)
        .setTitle('Log-Kanal konfigurieren');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('log_channel')
        .setPlaceholder('Textkanal auswählen...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Log-Kanal')
        .setDescription('Kanal, in dem neue Bewerbungen geloggt werden')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`,
        });

        const channelId = (modalSubmission.fields.getField('log_channel') as SelectMenuModalData).values[0];
        const channel = selectInteraction.guild!.channels.cache.get(channelId);

        if (selectedRoleId) {
            const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
            roleSettings.logChannelId = channelId;
            await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
        } else {
            await setLogChannel(client, guildId, 'applications', channelId);
            settings.logChannelId = channelId;
            await saveApplicationSettings(client, guildId, settings);
        }

        await modalSubmission.reply({
            embeds: [successEmbed('Log-Kanal aktualisiert', `Bewerbungs-Logs werden jetzt an ${channel ?? `<#${channelId}>`} gesendet.\nDu kannst das auch über \`/logging dashboard\` verwalten.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if ((error as ErrorLike).code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in log channel modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Beim Aktualisieren des Log-Kanals ist ein Fehler aufgetreten.',
        });
    }
}

async function handleManagerRole(selectInteraction: StringSelectMenuInteraction, rootInteraction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_manager_role_modal_${guildId}`)
        .setTitle('Manager-Rollen konfigurieren');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('manager_roles')
        .setPlaceholder('Rollen für Manager-Zugriff auswählen...')
        .setMinValues(1)
        .setMaxValues(5)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Manager-Rollen')
        .setDescription('Ausgewählte Rollen werden als Manager-Rollen an- bzw. abgeschaltet')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_manager_role_modal_${guildId}`,
        });

        const selectedRoleIds = (modalSubmission.fields.getField('manager_roles') as SelectMenuModalData).values;
        const roleSet = new Set((settings.managerRoles as ManagerRoles) ?? []);

        for (const roleId of selectedRoleIds) {
            if (roleSet.has(roleId)) {
                roleSet.delete(roleId);
            } else {
                roleSet.add(roleId);
            }
        }

        const managerRoles = Array.from(roleSet);
        settings.managerRoles = managerRoles;
        await saveApplicationSettings(client, guildId, settings);

        const finalList = managerRoles.length > 0
            ? managerRoles.map(id => `<@&${id}>`).join(',')
            : '`Keine`';

        await modalSubmission.reply({
            embeds: [successEmbed('Manager-Rollen aktualisiert', `Aktuelle Manager-Rollen: ${finalList}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if ((error as ErrorLike).code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in manager role modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Beim Aktualisieren der Manager-Rollen ist ein Fehler aufgetreten.',
        });
    }
}

async function handleQuestions(selectInteraction: StringSelectMenuInteraction, rootInteraction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient, selectedRoleId: string | null) {
    let currentQuestions = settings.questions ?? [];
    
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentQuestions = roleSettings.questions ?? currentQuestions;
    }

    const modal = new ModalBuilder()
        .setCustomId('app_cfg_questions')
        .setTitle('Bewerbungsfragen bearbeiten')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('q1')
                    .setLabel('Frage 1 (Pflicht)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('Frage 2 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('Frage 3 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('Frage 4 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('Frage 5 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[4] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_questions' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newQuestions = ['q1', 'q2', 'q3', 'q4', 'q5']
        .map(key => submitted.fields.getTextInputValue(key).trim())
        .filter(Boolean);

    if (newQuestions.length === 0) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: 'Mindestens eine Frage ist erforderlich.' });
        return;
    }

    if (selectedRoleId) {
        
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        roleSettings.questions = newQuestions;
        await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
    } else {
        
        settings.questions = newQuestions;
        await saveApplicationSettings(client, guildId, settings);
    }

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Fragen aktualisiert',
                `${newQuestions.length} Frage${newQuestions.length !== 1 ? 'n' : ''} gespeichert.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId, client);
}

async function handleRoleAdd(selectInteraction: StringSelectMenuInteraction, rootInteraction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_add_modal_${guildId}`)
        .setTitle('Bewerbungsrolle hinzufügen');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('application_role')
        .setPlaceholder('Rolle wählen, auf die sich Mitglieder bewerben können...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Bewerbungsrolle')
        .setDescription('Die Discord-Rolle, auf die sich Mitglieder bewerben')
        .setRoleSelectMenuComponent(roleSelect);

    const nameInput = new TextInputBuilder()
        .setCustomId('role_name')
        .setLabel('Anzeigename (leer = Rollenname)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setRequired(false);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_add_modal_${guildId}`,
        });

        const roleId = (modalSubmission.fields.getField('application_role') as SelectMenuModalData).values[0];
        const role = selectInteraction.guild!.roles.cache.get(roleId);
        const customName = modalSubmission.fields.getTextInputValue('role_name').trim() || role?.name || roleId;

        if (roles.some(r => r.roleId === roleId)) {
            await replyUserError(modalSubmission, { type: ErrorTypes.UNKNOWN, message: `${role ?? roleId} ist bereits eine Bewerbungsrolle.` });
            return;
        }

        roles.push({ roleId, name: customName });
        await saveApplicationRoles(client, guildId, roles);
        await saveApplicationRoleSettings(client, guildId, roleId, {
            questions: getDefaultApplicationQuestions(),
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Rolle hinzugefügt', `${role ?? roleId} wurde als **${customName}** hinzugefügt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if ((error as ErrorLike).code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role add modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Beim Hinzufügen der Bewerbungsrolle ist ein Fehler aufgetreten.',
        });
    }
}

async function handleRoleRemove(selectInteraction: StringSelectMenuInteraction, rootInteraction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient) {
    if (roles.length === 0) {
        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: 'Es sind keine Bewerbungsrollen eingerichtet, die entfernt werden könnten.',
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_remove_modal_${guildId}`)
        .setTitle('Bewerbungsrolle entfernen');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('remove_role')
        .setPlaceholder('Zu entfernende Rolle auswählen...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Bewerbungsrolle entfernen')
        .setDescription('Rolle, die aus der Bewerbungsliste entfernt werden soll')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_remove_modal_${guildId}`,
        });

        const roleId = (modalSubmission.fields.getField('remove_role') as SelectMenuModalData).values[0];
        const index = roles.findIndex(r => r.roleId === roleId);

        if (index === -1) {
            await replyUserError(modalSubmission, { type: ErrorTypes.USER_INPUT, message: `<@&${roleId}> ist nicht in der Liste der Bewerbungsrollen.` });
            return;
        }

        roles.splice(index, 1);
        await saveApplicationRoles(client, guildId, roles);

        await modalSubmission.reply({
            embeds: [successEmbed('Rolle entfernt', `<@&${roleId}> wurde aus den Bewerbungsrollen entfernt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if ((error as ErrorLike).code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role remove modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Beim Entfernen der Bewerbungsrolle ist ein Fehler aufgetreten.',
        });
    }
}

async function handleRetention(selectInteraction: StringSelectMenuInteraction, rootInteraction: AppDashboardInteraction, settings: ApplicationSettings, roles: ApplicationRole[], guildId: string, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('Aufbewahrungsdauer für Bewerbungen');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**Offen** — wie lange unbeantwortete bzw. laufende Bewerbungen gespeichert werden, bevor sie automatisch entfernt werden.\n' +
            '**Geprüft** — wie lange angenommene oder abgelehnte Bewerbungen gespeichert werden.\n' +
            '-# Gib eine ganze Zahl zwischen 1 und 3650 ein (max. 10 Jahre).',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('Aufbewahrung offen (Tage)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('pending_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.pendingApplicationRetentionDays ?? 30))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    const reviewedLabel = new LabelBuilder()
        .setLabel('Aufbewahrung geprüft (Tage)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('reviewed_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.reviewedApplicationRetentionDays ?? 14))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    modal
        .addTextDisplayComponents(retentionInfo)
        .addLabelComponents(pendingLabel, reviewedLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_retention' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const pendingDays = parseInt(submitted.fields.getTextInputValue('pending_days').trim(), 10);
    const reviewedDays = parseInt(submitted.fields.getTextInputValue('reviewed_days').trim(), 10);

    if (isNaN(pendingDays) || pendingDays < 1 || pendingDays > 3650) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Die Aufbewahrung für offene Bewerbungen muss eine ganze Zahl zwischen **1** und **3650** Tagen sein.' });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Die Aufbewahrung für geprüfte Bewerbungen muss eine ganze Zahl zwischen **1** und **3650** Tagen sein.' });
        return;
    }

    settings.pendingApplicationRetentionDays = pendingDays;
    settings.reviewedApplicationRetentionDays = reviewedDays;
    await saveApplicationSettings(client, guildId, settings);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Aufbewahrung aktualisiert',
                `Offene Bewerbungen werden **${pendingDays} Tage** gespeichert.\nGeprüfte Bewerbungen werden **${reviewedDays} Tage** gespeichert.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId, client);
}

async function handleDeleteApplication(confirmSubmit: ModalSubmitInteraction, selectedRoleId: string, guildId: string, roles: ApplicationRole[], client: NexoClient) {
    try {
        
        const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
        if (roleIndex === -1) {
            await replyUserError(confirmSubmit, { type: ErrorTypes.USER_INPUT, message: 'Bewerbungsrolle nicht gefunden.' });
            return;
        }

        const deletedRole = roles[roleIndex];

        roles.splice(roleIndex, 1);

        await saveApplicationRoles(client, guildId, roles);

        await deleteApplicationRoleSettings(client, guildId, selectedRoleId);

        const allApplications = await getApplications(client, guildId);
        const applicationsToDelete = allApplications.filter(app => app.roleId === selectedRoleId);

        for (const app of applicationsToDelete) {
            await deleteApplication(client, guildId, app.id, app.userId);
        }

        await confirmSubmit.reply({
            embeds: [
                successEmbed(
                    '🗑️ Bewerbung gelöscht',
                    `Die Bewerbung für <@&${selectedRoleId}> (**${deletedRole.name}**) wurde endgültig gelöscht.\n\n` +
                    `Gelöscht: **${applicationsToDelete.length}** Bewerbung${applicationsToDelete.length !== 1 ? 'en' : ''}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error('Error in handleDeleteApplication:', error);
        await replyUserError(confirmSubmit, { type: ErrorTypes.UNKNOWN, message: 'Beim Löschen der Bewerbung ist ein Fehler aufgetreten. Bitte versuch es erneut.' });
    }
}
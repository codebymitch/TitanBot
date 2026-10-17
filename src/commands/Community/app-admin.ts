import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, LabelBuilder, RoleSelectMenuBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, GuildMember, TextChannel } from 'discord.js';
import type { Command } from '../../types/index.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getColor, getApplicationStatusColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { withErrorHandling, createError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { 
    getApplicationSettings, 
    saveApplicationSettings, 
    getApplication, 
    getApplications, 
    updateApplication,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplication
} from '../../utils/database.js';
import type { Application, ApplicationFilters } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import appDashboard from './modules/app_dashboard.js';

function getApplicationStatusPresentation(statusValue: unknown) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';
    const statusLabel =
        normalized === 'pending' ? 'In Bearbeitung' :
        normalized === 'approved' ? 'Angenommen' :
        normalized === 'denied' ? 'Abgelehnt' :
        'Unbekannt';
    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    data: new SlashCommandBuilder()
    .setName("app-admin")
    .setDescription("Team-Bewerbungen verwalten")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
        subcommand
            .setName("setup")
            .setDescription("Eine neue Bewerbung einrichten")
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("review")
            .setDescription("Eine Bewerbung annehmen oder ablehnen")
            .addStringOption((option) =>
                option
                    .setName("id")
                    .setDescription("Die Bewerbungs-ID")
                    .setRequired(true),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("list")
            .setDescription("Alle Bewerbungen auflisten")
            .addStringOption((option) =>
                option
                    .setName("status")
                    .setDescription("Nach Status filtern")
                    .addChoices(
                        { name: "Offen", value: "pending" },
                        { name: "Angenommen", value: "approved" },
                        { name: "Abgelehnt", value: "denied" },
                    ),
            )
            .addStringOption((option) =>
                option.setName("role").setDescription("Nach Rollen-ID filtern"),
            )
            .addUserOption((option) =>
                option.setName("user").setDescription("Nach Nutzer filtern"),
            )
            .addNumberOption((option) =>
                option
                    .setName("limit")
                    .setDescription(
                        "Maximale Anzahl angezeigter Bewerbungen (Standard: 10)",
                    )
                    .setMinValue(1)
                    .setMaxValue(25),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("dashboard")
            .setDescription("Öffnet das Konfigurations-Dashboard für Bewerbungen")
            .addStringOption((option) =>
                option
                    .setName("application")
                    .setDescription("Wähle eine Bewerbung zum Konfigurieren")
                    .setRequired(false)
                    .setAutocomplete(true),
            ),
    ),

    category: "Community",

    execute: withErrorHandling(async (interaction: ChatInputCommandInteraction) => {
        if (!interaction.inGuild()) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieser Command kann nur auf einem Server genutzt werden.' });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== 'dashboard' && subcommand !== 'setup') {
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
        }

        logger.info(`App-admin command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild!.id,
            subcommand
        });

        await ApplicationService.checkManagerPermission(interaction.client, guild!.id, member as GuildMember);

        if (subcommand === "setup") {
            await handleSetup(interaction);
        } else if (subcommand === "review") {
            await handleReview(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        } else if (subcommand === "dashboard") {
            const selectedAppName = interaction.options.getString("application");
            await appDashboard.execute(interaction, null, interaction.client, selectedAppName);
        }
    }, { type: 'command', commandName: 'app-admin' })
} satisfies Command;

async function handleSetup(interaction: ChatInputCommandInteraction) {
    
    if (interaction.deferred || interaction.replied) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diese Interaktion wurde bereits verarbeitet. Bitte führe den Command erneut aus.' });
    }

    const modal = new ModalBuilder()
        .setCustomId('app_setup_modal')
        .setTitle('Neue Bewerbung einrichten');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('role_id')
        .setPlaceholder('Rolle wählen, auf die sich Nutzer bewerben')
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Bewerbungsrolle')
        .setDescription('Die Rolle, auf die sich Nutzer bewerben')
        .setRoleSelectMenuComponent(roleSelect);

    const appNameInput = new TextInputBuilder()
        .setCustomId('app_name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('z. B. Moderator, Helfer, Entwickler')
        .setMaxLength(50)
        .setMinLength(1)
        .setRequired(true);

    const appNameLabel = new LabelBuilder()
        .setLabel('Name der Bewerbung')
        .setTextInputComponent(appNameInput);

    const q1Input = new TextInputBuilder()
        .setCustomId('app_question_1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Warum möchtest du diese Rolle?')
        .setMaxLength(100)
        .setMinLength(1)
        .setRequired(true);

    const q1Label = new LabelBuilder()
        .setLabel('Frage 1 (Pflicht)')
        .setTextInputComponent(q1Input);

    const q2Input = new TextInputBuilder()
        .setCustomId('app_question_2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Welche Erfahrung hast du?')
        .setMaxLength(100)
        .setRequired(false);

    const q2Label = new LabelBuilder()
        .setLabel('Frage 2 (optional)')
        .setTextInputComponent(q2Input);

    const q3Input = new TextInputBuilder()
        .setCustomId('app_question_3')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(false);

    const q3Label = new LabelBuilder()
        .setLabel('Frage 3 (optional)')
        .setTextInputComponent(q3Input);

    modal.addLabelComponents(roleLabel, appNameLabel, q1Label, q2Label, q3Label);

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
        time: 15 * 60 * 1000, 
        filter: (i) =>
            i.customId === 'app_setup_modal' &&
            i.user.id === interaction.user.id,
    }).catch(() => null);

    if (!submitted) {
        logger.info('App setup modal dismissed or timed out', { guildId: interaction.guild!.id, userId: interaction.user.id });
        return;
    }

    const appName = submitted.fields.getTextInputValue('app_name').trim();
    const selectedRoles = submitted.fields.getSelectedRoles('role_id');
    const roleId = selectedRoles!.first()?.id;

    if (!roleId) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: 'Du musst eine Rolle für die Bewerbung auswählen.' });
        return;
    }

    const questions = [
        submitted.fields.getTextInputValue('app_question_1').trim(),
        submitted.fields.getTextInputValue('app_question_2').trim(),
        submitted.fields.getTextInputValue('app_question_3').trim(),
    ].filter(q => q.length > 0);

    const role = await interaction.guild!.roles.fetch(roleId).catch(() => null);
    if (!role) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Die ausgewählte Rolle wurde nicht gefunden.' });
        return;
    }

    const existingRoles = await getApplicationRoles(interaction.client, interaction.guild!.id);
    if (existingRoles.some(r => r.roleId === roleId)) {
        await replyUserError(submitted, { type: ErrorTypes.CONFIGURATION, message: `Die Rolle ${role} ist bereits als Bewerbung eingerichtet.` });
        return;
    }

    existingRoles.push({
        roleId: roleId,
        name: appName,
        enabled: true,  
    });

    await saveApplicationRoles(interaction.client, interaction.guild!.id, existingRoles);

    const settings = await getApplicationSettings(interaction.client, interaction.guild!.id);
    if (!settings.enabled) {
        await ApplicationService.updateSettings(interaction.client, interaction.guild!.id, { enabled: true });
    }

    await saveApplicationRoleSettings(interaction.client, interaction.guild!.id, roleId, { questions });

    await submitted.reply({
        embeds: [successEmbed(
            '✅ Bewerbung erstellt',
            `Die Bewerbung **${appName}** wurde für ${role} erstellt.\n\nLog-Kanal, Manager-Rollen, Fragen und Aufbewahrungsdauer kannst du im Dashboard anpassen.`,
        )],
        flags: ['Ephemeral'],
    });

    setTimeout(() => {
        appDashboard.execute(submitted, null, interaction.client, appName);
    }, 500);
}

async function handleReview(interaction: ChatInputCommandInteraction) {
    const appId = interaction.options.getString("id")!;

    const application = await getApplication(
        interaction.client,
        interaction.guild!.id,
        appId,
    );
    if (!application) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Bewerbung nicht gefunden.' });
    }

    if (application.status !== "pending") {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diese Bewerbung wurde bereits bearbeitet.' });
    }

    const appEmbed = createEmbed({
        title: `Bewerbung prüfen`,
        description: `**Nutzer:** <@${application.userId}>\n**Bewerbung:** ${application.roleName}\n**Bewerbungs-ID:** \`${appId}\``,
        color: 'info',
    });

    if (application.answers && application.answers.length > 0) {
        application.answers.forEach((item, index) => {
            appEmbed.addFields({
                name: `F${index + 1}: ${item.question}`,
                value: item.answer || '*Keine Antwort angegeben*',
                inline: false
            });
        });
    }

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_review_approve_${appId}`)
            .setLabel('Annehmen')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_review_deny_${appId}`)
            .setLabel('Ablehnen')
            .setStyle(ButtonStyle.Danger),
    );

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [appEmbed],
        components: [buttonRow],
        flags: ["Ephemeral"],
    });

    const collector = interaction.channel!.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i =>
            i.user.id === interaction.user.id &&
            (i.customId.startsWith(`app_review_approve_${appId}`) ||
             i.customId.startsWith(`app_review_deny_${appId}`)),
        time: 300_000, 
        max: 1,
    });

    collector.on('collect', async buttonInteraction => {
        const isApprove = buttonInteraction.customId.includes('approve');

        const reasonModal = new ModalBuilder()
            .setCustomId(`app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}`)
            .setTitle(`Bewerbung ${isApprove ? 'annehmen' : 'ablehnen'} – Grund`);

        reasonModal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('review_reason')
                    .setLabel('Grund (optional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Gib einen Grund für diese Entscheidung an...')
                    .setMaxLength(500)
                    .setRequired(false),
            ),
        );

        await buttonInteraction.showModal(reasonModal);

        try {
            const reasonSubmit = await buttonInteraction.awaitModalSubmit({
                time: 5 * 60 * 1000, 
                filter: i =>
                    i.customId === `app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}` &&
                    i.user.id === buttonInteraction.user.id,
            }).catch(() => null);

            if (!reasonSubmit) return;

            const reason = reasonSubmit.fields.getTextInputValue('review_reason').trim() || "Kein Grund angegeben.";
            const action = isApprove ? 'approve' : 'deny';
            const status = isApprove ? 'approved' : 'denied';

            const updatedApplication = await ApplicationService.reviewApplication(
                reasonSubmit.client,
                interaction.guild!.id,
                appId,
                {
                    action,
                    reason,
                    reviewerId: reasonSubmit.user.id
                }
            );

            try {
                const user = await reasonSubmit.client.users.fetch(application.userId);
                const statusColor = getApplicationStatusColor(status);
                const reviewStatus = getApplicationStatusPresentation(status);
                const dmEmbed = createEmbed({
                    title: `${reviewStatus.statusEmoji} Bewerbung ${reviewStatus.statusLabel.toLowerCase()}`,
                    description: `Deine Bewerbung für **${application.roleName}** wurde **${reviewStatus.statusLabel.toLowerCase()}**.\n` +
                        `**Hinweis:** ${reason}\n\n` +
                        `Details siehst du mit \`/apply status id:${appId}\`.`
                }).setColor(statusColor);

                await user.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.warn('Failed to send DM to user for application review', {
                    error: (error as Error).message,
                    userId: application.userId,
                    applicationId: appId
                });
            }

            if (application.logMessageId && application.logChannelId) {
                try {
                    const statusColor = getApplicationStatusColor(status);
                    const logChannel = interaction.guild!.channels.cache.get(
                        application.logChannelId as string,
                    ) as TextChannel | undefined;
                    if (logChannel) {
                        const logMessage = await logChannel.messages.fetch(
                            application.logMessageId as string,
                        );
                        if (logMessage) {
                            const embed = logMessage.embeds[0];
                            if (embed) {
                                const reviewStatus = getApplicationStatusPresentation(status);
                                const newEmbed = EmbedBuilder.from(embed)
                                    .setColor(statusColor)
                                    .spliceFields(0, 1, {
                                        name: "Status",
                                        value: `${reviewStatus.statusEmoji} ${reviewStatus.statusLabel}`,
                                    });

                                await logMessage.edit({
                                    embeds: [newEmbed],
                                    components: [],
                                });
                            }
                        }
                    }
                } catch (error) {
                    logger.warn('Failed to update log message for application', {
                        error: (error as Error).message,
                        applicationId: appId,
                        logMessageId: application.logMessageId
                    });
                }
            }

            if (isApprove) {
                try {
                    const member = await interaction.guild!.members.fetch(
                        application.userId,
                    );
                    await member.roles.add(application.roleId!);
                } catch (error) {
                    logger.error('Failed to assign role to approved applicant', {
                        error: (error as Error).message,
                        userId: application.userId,
                        roleId: application.roleId,
                        applicationId: appId
                    });
                }
            }

            await reasonSubmit.reply({
                embeds: [
                    successEmbed(
                        `Bewerbung ${isApprove ? 'angenommen' : 'abgelehnt'}`,
                        `Die Bewerbung wurde **${isApprove ? 'angenommen' : 'abgelehnt'}**.`,
                    ),
                ],
                flags: ["Ephemeral"],
            });

        } catch (error) {
            logger.error('Error reviewing application:', error);
            await replyUserError(buttonInteraction, { type: ErrorTypes.UNKNOWN, message: 'Beim Prüfen der Bewerbung ist ein Fehler aufgetreten.' });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = createEmbed({
                title: 'Prüfung abgelaufen',
                description: 'Die Buttons zur Prüfung sind abgelaufen.',
                color: 'warning',
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });
}

async function handleList(interaction: ChatInputCommandInteraction) {
    const status = interaction.options.getString("status");
    const user = interaction.options.getUser("user");
    const limit = interaction.options.getNumber("limit") || 10;

    const filters: ApplicationFilters = {};
    
    if (status) {
        filters.status = status;
    } else {
        filters.status = 'pending';
    }

    let applications = await getApplications(
        interaction.client,
        interaction.guild!.id,
        filters,
    );

    if (!user) {
        applications = await Promise.all(
            applications.map(async (app) => {
                try {
                    await interaction.guild!.members.fetch(app.userId);
                    return app; 
                } catch {
                    
                    await deleteApplication(interaction.client, interaction.guild!.id, app.id, app.userId);
                    return null; 
                }
            })
        ).then(results => results.filter((app): app is Application => Boolean(app))); 
    }

    if (user) {
        applications = applications.filter((app) => app.userId === user.id);
    }

    if (applications.length === 0) {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild!.id);
        
        if (applicationRoles.length > 0) {
            const embed = createEmbed({ 
                title: "Keine Bewerbungen gefunden", 
                description: "Es wurden keine eingereichten Bewerbungen gefunden, die zu deinen Kriterien passen.\n\nDiese Bewerbungsrollen sind aber eingerichtet:" 
            });

            applicationRoles.forEach((appRole, index) => {
                const role = interaction.guild!.roles.cache.get(appRole.roleId);
                embed.addFields({
                    name: `${index + 1}. ${appRole.name}`,
                    value: `**Rolle:** ${role ?`<@&${appRole.roleId}>`: 'Rolle nicht gefunden'}\n**Für Bewerbungen verfügbar:** Ja`,
                    inline: false
                });
            });

            embed.setFooter({
                text: "Nutzer bewerben sich mit /apply submit und sehen verfügbare Rollen mit /apply list"
            });

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        } else {
            return await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'Keine Bewerbungen gefunden und keine Bewerbungsrollen eingerichtet.\n' +
                    'Richte zuerst mit `/app-admin setup` eine Bewerbungsrolle ein.'
            });
        }
    }

    applications = applications
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

    const embed = createEmbed({ title: "Eingereichte Bewerbungen", description: `${applications.length} Bewerbung(en) werden angezeigt.`, });

    applications.forEach((app) => {
        const statusView = getApplicationStatusPresentation(app?.status);
        const roleName = app?.roleName || 'Unbekannte Rolle';
        const username = app?.username || 'Unbekannter Nutzer';
        const createdAt = app?.createdAt ? new Date(app.createdAt) : null;
        const createdAtDisplay = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.toLocaleString()
            : 'Unbekanntes Datum';

        embed.addFields({
            name: `${statusView.statusEmoji} ${roleName} - ${username}`,
            value:
                `**ID:** \`${app.id}\`\n` +
                `**Status:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Datum:** ${createdAtDisplay}`,
            inline: true,
        });
    });

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}


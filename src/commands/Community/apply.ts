import { getColor, getDefaultApplicationQuestions } from '../../config/bot.js';
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import type { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import type { Command } from '../../types/index.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logEvent, EVENT_TYPES, resolveApplicationLogChannel } from '../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../utils/logging/logEmbeds.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { 
    getApplicationSettings, 
    getUserApplications, 
    createApplication, 
    getApplication,
    getApplicationRoles,
    updateApplication,
    getApplicationRoleSettings
} from '../../utils/database.js';
import type { ApplicationAnswer, ApplicationSettings } from '../../utils/database.js';

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
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Bewerbungen für Rollen verwalten")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("submit")
                .setDescription("Eine Bewerbung für eine Rolle einreichen")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("Die Bewerbung, die du einreichen möchtest")
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("status")
                .setDescription("Den Status deiner Bewerbung prüfen")
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription("Bewerbungs-ID (leer lassen, um alle zu sehen)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("Verfügbare Bewerbungen anzeigen"),
        ),

    category: "Community",

    execute: withErrorHandling(async (interaction: ChatInputCommandInteraction) => {
        if (!interaction.inGuild()) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieser Command kann nur auf einem Server genutzt werden.' });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== "submit") {
            const isListCommand = subcommand === "list";
            await InteractionHelper.safeDefer(interaction, { flags: isListCommand ? [] : ["Ephemeral"] });
        }

        logger.info(`Apply command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild!.id,
            subcommand
        });

        const settings = await getApplicationSettings(
            interaction.client,
            guild!.id,
        );
        
        if (!settings.enabled) {
            throw createError(
                'Applications are disabled',
                ErrorTypes.CONFIGURATION,
                'Bewerbungen sind auf diesem Server derzeit deaktiviert.',
                { guildId: guild!.id }
            );
        }

        if (subcommand === "submit") {
            await handleSubmit(interaction, settings);
        } else if (subcommand === "status") {
            await handleStatus(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        }
    }, { type: 'command', commandName: 'apply' })
} satisfies Command;

export async function handleApplicationModal(interaction: ModalSubmitInteraction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_modal_')) return;
    
    const roleId = customId.split('_')[2];
    
    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild!.id);
    const applicationRole = applicationRoles.find(appRole => appRole.roleId === roleId);
    
    if (!applicationRole) {
        return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'Bewerbungskonfiguration nicht gefunden.' });
    }
    
    const role = interaction.guild!.roles.cache.get(roleId);
    
    if (!role) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Rolle nicht gefunden.' });
    }
    
    const answers: ApplicationAnswer[] = [];
    const settings = await getApplicationSettings(interaction.client, interaction.guild!.id);

    let questions = settings.questions?.length ? settings.questions : getDefaultApplicationQuestions();
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild!.id, roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }
    
    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`q${i}`);
        answers.push({
            question: questions[i],
            answer: answer
        });
    }
    
    try {
        const application = await ApplicationService.submitApplication(interaction.client, {
            guildId: interaction.guild!.id,
            userId: interaction.user.id,
            roleId: roleId,
            roleName: applicationRole.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });
        
        const embed = successEmbed(
            'Bewerbung eingereicht',
            `Deine Bewerbung für **${applicationRole.name}** wurde erfolgreich eingereicht!\n\n` +
            `Bewerbungs-ID: \`${application.id}\`\n` +
            `Den Status prüfst du mit \`/apply status id:${application.id}\``
        );
        
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        
        const settings = await getApplicationSettings(interaction.client, interaction.guild!.id);
        const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild!.id, roleId);
        const guildConfig = await getGuildConfig(interaction.client, interaction.guild!.id);

        const logChannelId = resolveApplicationLogChannel(guildConfig, roleSettings, settings);

        if (logChannelId) {
            const logMessage = await logEvent({
                client: interaction.client,
                guildId: interaction.guild!.id,
                eventType: EVENT_TYPES.APPLICATION_SUBMIT,
                channelId: logChannelId,
                data: {
                    title: 'Bewerbung eingereicht',
                    lines: [
                        formatLogLine('Bewerber', `<@${interaction.user.id}> (${interaction.user.tag})`),
                        formatLogLine('Bewerbung', applicationRole.name),
                        formatLogLine('Rolle', role.name),
                        formatLogLine('Bewerbungs-ID', `\`${application.id}\``),
                    ],
                    inlineFields: [
                        { name: 'Status', value: '🟡 In Bearbeitung', inline: true },
                    ],
                    author: await resolveUserAuthor(interaction.client, interaction.user.id),
                },
            });

            if (logMessage) {
                await updateApplication(interaction.client, interaction.guild!.id, application.id, {
                    logMessageId: logMessage.id,
                    logChannelId,
                });
            }
        }
        
    } catch (error) {
        logger.error('Error creating application:', {
            error: (error as Error).message,
            userId: interaction.user.id,
            guildId: interaction.guild!.id,
            roleId,
            stack: (error as Error).stack
        });
        
        await handleInteractionError(interaction, error, {
            type: 'modal',
            handler: 'application_submission'
        });
    }
}

async function handleList(interaction: ChatInputCommandInteraction) {
    try {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild!.id);
        
        if (applicationRoles.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Derzeit sind keine Bewerbungen verfügbar.' });
        }

        const embed = createEmbed({
            title: "Verfügbare Bewerbungen",
            description: "Auf diese Rollen kannst du dich bewerben:"
        });

        applicationRoles.forEach((appRole, index) => {
            const role = interaction.guild!.roles.cache.get(appRole.roleId);
            embed.addFields({
                name: `${index + 1}. ${appRole.name}`,
                value: `**Rolle:** ${role ?`<@&${appRole.roleId}>`: 'Rolle nicht gefunden'}\n` +
                       `**Bewerben mit:** \`/apply submit application:"${appRole.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "Nutze /apply submit application:<name>, um dich auf eine dieser Rollen zu bewerben."
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error listing applications:', {
            error: (error as Error).message,
            guildId: interaction.guild!.id,
            stack: (error as Error).stack
        });
        
        throw createError(
            'Failed to load applications',
            ErrorTypes.DATABASE,
            'Bewerbungen konnten nicht geladen werden. Bitte versuch es später erneut.',
            { guildId: interaction.guild!.id }
        );
    }
}

async function handleSubmit(interaction: ChatInputCommandInteraction, settings: ApplicationSettings) {
    const applicationName = interaction.options.getString("application");
    const member = interaction.member;

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild!.id);
    
    const applicationRole = applicationRoles.find(appRole => 
        appRole.name.toLowerCase() === applicationName!.toLowerCase()
    );

    if (!applicationRole) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Bewerbung nicht gefunden. Nutze `/apply list`, um die verfügbaren Bewerbungen zu sehen.' });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild!.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast bereits eine offene Bewerbung. Bitte warte, bis sie geprüft wurde.' });
    }

    const role = interaction.guild!.roles.cache.get(applicationRole.roleId);
    if (!role) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Die Rolle für diese Bewerbung existiert nicht mehr.' });
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRole.roleId}`)
        .setTitle(`Bewerbung: ${applicationRole.name}`.slice(0, 45));

    let questions = settings.questions?.length ? settings.questions : getDefaultApplicationQuestions();
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild!.id, applicationRole.roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }

    questions.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`q${index}`)
            .setLabel(
                question.length > 45
                    ? `${question.substring(0, 42)}...`
                    : question,
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(row);
    });

    await interaction.showModal(modal);
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
    const appId = interaction.options.getString("id");

    if (appId) {
        const application = await getApplication(
            interaction.client,
            interaction.guild!.id,
            appId,
        );

        if (!application || application.userId !== interaction.user.id) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Bewerbung nicht gefunden oder du darfst sie nicht ansehen.' });
        }

        const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
        const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
            ? submittedAt.toLocaleString()
            : 'Unbekanntes Datum';
        const statusView = getApplicationStatusPresentation(application.status);
        const embed = createEmbed({
            title: `Bewerbung #${application.id} - ${application.roleName || 'Unbekannte Rolle'}`,
            description:
                `**Bewerbungs-ID:** \`${application.id}\`\n` +
                `**Status:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Eingereicht:** ${submittedAtDisplay}`
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    } else {
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild!.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast noch keine Bewerbungen eingereicht.' });
        }

        const recentApplications = applications
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 10);

        const embed = createEmbed({
            title: "Deine Bewerbungen",
            description: `${recentApplications.length} aktuelle Bewerbung(en).`
        });

        recentApplications.forEach((application) => {
            const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
            const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
                ? submittedAt.toLocaleDateString()
                : 'Unbekanntes Datum';
            const statusView = getApplicationStatusPresentation(application.status);

            embed.addFields({
                name: `${statusView.statusEmoji} ${application.roleName || 'Unbekannte Rolle'} (${statusView.statusLabel})`,
                value:
                    `**ID:** \`${application.id}\`\n` +
                    `**Status:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                    `**Eingereicht:** ${submittedAtDisplay}`,
                inline: true,
            });
        });

        if (applications.length > recentApplications.length) {
            embed.setFooter({ text: `Die neuesten ${recentApplications.length} von ${applications.length} Bewerbungen.` });
        }

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    }
}
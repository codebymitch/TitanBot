import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Community/apply.js
const data = new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Manage role applications")
    .addSubcommand((subcommand) =>
        subcommand
            .setName("submit")
            .setDescription("Submit an application for a role")
            .addRoleOption((option) =>
                option
                    .setName("role")
                    .setDescription("The role you're applying for")
                    .setRequired(true),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("status")
            .setDescription("Check the status of your application")
            .addStringOption((option) =>
                option
                    .setName("id")
                    .setDescription("Application ID (leave empty to see all)")
                    .setRequired(false),
            ),
    );

export { data };

export async function execute(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({
            embeds: [errorEmbed("This command can only be used in a server.")],
            ephemeral: true,
        });
    }

    const { options, guild, member } = interaction;
    const subcommand = options.getSubcommand();

    try {
        // Check if applications are enabled
        const settings = await getApplicationSettings(
            interaction.client,
            guild.id,
        );
        if (!settings.enabled) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Applications are currently disabled in this server.",
                    ),
                ],
                ephemeral: true,
            });
        }

        if (subcommand === "submit") {
            await handleSubmit(interaction, settings);
        } else if (subcommand === "status") {
            await handleStatus(interaction);
        }
    } catch (error) {
        console.error("Error in apply command:", error);
        interaction.reply({
            embeds: [
                errorEmbed("An error occurred while processing your request."),
            ],
            ephemeral: true,
        });
    }
}

async function handleSubmit(interaction, settings) {
    const role = interaction.options.getRole("role");
    const member = interaction.member;

    // Check if user has any pending applications
    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return interaction.reply({
            embeds: [
                errorEmbed(
                    `You already have a pending application. Please wait for it to be reviewed.`,
                ),
            ],
            ephemeral: true,
        });
    }

    // Check cooldown
    const lastApp = userApps.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    )[0];
    if (lastApp) {
        const cooldown = BotConfig.applications?.applicationCooldown || 24; // hours
        const lastAppDate = new Date(lastApp.createdAt);
        const cooldownEnd = new Date(
            lastAppDate.getTime() + cooldown * 60 * 60 * 1000,
        );

        if (new Date() < cooldownEnd) {
            const remaining = Math.ceil(
                (cooldownEnd - new Date()) / (1000 * 60 * 60),
            );
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        `You're on cooldown. Please wait ${remaining} more hours before submitting another application.`,
                    ),
                ],
                ephemeral: true,
            });
        }
    }

    // Create and show the application modal
    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${role.id}`)
        .setTitle(`Application for ${role.name}`);

    // Add text inputs for each question
    const questions =
        settings.questions || BotConfig.applications.defaultQuestions;

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

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
    });

    await interaction.showModal(modal);

    // Handle the modal submission
    try {
        const modalResponse = await interaction.awaitModalSubmit({
            time: 30 * 60 * 1000, // 30 minutes
            filter: (i) =>
                i.customId === `app_modal_${role.id}` &&
                i.user.id === interaction.user.id,
        });

        // Process the application
        const answers = [];
        questions.forEach((question, index) => {
            const answer = modalResponse.fields.getTextInputValue(`q${index}`);
            answers.push({ question, answer });
        });

        // Create the application
        const application = {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            role: role.id,
            roleName: role.name,
            username: interaction.user.username,
            discriminator: interaction.user.discriminator,
            avatar: interaction.user.displayAvatarURL({ dynamic: true }),
            answers,
            status: "pending",
            reviewer: null,
            reviewMessage: null,
        };

        const createdApp = await createApplication(
            interaction.client,
            application,
        );

        // Send confirmation to user
        await modalResponse.reply({
            embeds: [
                successEmbed(
                    "Application Submitted",
                    `Your application for **${role.name}** has been submitted successfully!\n` +
                        `Application ID: \`${createdApp.id}\`\n` +
                        `You will be notified when there's an update.`,
                ),
            ],
            ephemeral: true,
        });

        // Log the application
        await logApplication(interaction, createdApp, settings);
    } catch (error) {
        if (error.message.includes("timeout")) {
            // Modal was not submitted within the time limit
            return;
        }
        console.error("Error processing application:", error);
    }
}

async function handleStatus(interaction) {
    const appId = interaction.options.getString("id");

    if (appId) {
        // Show status of a specific application
        const application = await getApplication(
            interaction.client,
            interaction.guild.id,
            appId,
        );

        if (!application || application.userId !== interaction.user.id) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Application not found or you do not have permission to view it.",
                    ),
                ],
                ephemeral: true,
            });
        }

        const statusColor =
            BotConfig.applications.statusColors[application.status] ||
            "#000000";
        const embed = createEmbed(
            `Application #${application.id} - ${application.roleName}`,
            `**Status:** ${application.status.charAt(0).toUpperCase() + application.status.slice(1)}` +
                (application.reviewer
                    ? `\n**Reviewed by:** <@${application.reviewer}>`
                    : "") +
                (application.reviewMessage
                    ? `\n**Note:** ${application.reviewMessage}`
                    : "") +
                `\n\n**Submitted on:** ${new Date(application.createdAt).toLocaleString()}`,
            statusColor,
        );

        // Add answers to the embed
        application.answers.forEach((answer, index) => {
            embed.addFields({
                name: answer.question,
                value:
                    answer.answer.length > 1000
                        ? answer.answer.substring(0, 997) + "..."
                        : answer.answer,
                inline: false,
            });
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
        // List all user's applications
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return interaction.reply({
                embeds: [
                    errorEmbed("You have not submitted any applications yet."),
                ],
                ephemeral: true,
            });
        }

        const embed = createEmbed(
            "Your Applications",
            "Here are your recent applications. Use `/apply status id:<id>` to view details.",
        );

        applications.forEach((app) => {
            const status =
                app.status.charAt(0).toUpperCase() + app.status.slice(1);
            const statusEmoji =
                {
                    Pending: "🟡",
                    Approved: "🟢",
                    Denied: "🔴",
                }[status] || "⚪";

            embed.addFields({
                name: `${statusEmoji} ${app.role || "Unknown Role"}`,
                value:
                    `**ID:** \`${app.id}\`\n` +
                    `**Status:** ${status}\n` +
                    `**Date:** ${new Date(app.createdAt).toLocaleDateString()}`,
                inline: true,
            });
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function logApplication(interaction, application, settings) {
    if (!settings.logChannelId) return;

    const logChannel = interaction.guild.channels.cache.get(
        settings.logChannelId,
    );
    if (!logChannel) return;

    const embed = createEmbed(
        "📝 New Application Received",
        `**User:** ${application.username}#${application.discriminator} (${application.userId})\n         **Role:** ${application.roleName} (${application.role})\n         **Status:** Pending\n`,
        BotConfig.applications.statusColors.pending,
    );

    embed.setThumbnail(application.avatar);
    embed.setTimestamp(new Date(application.createdAt));
    embed.setFooter({ text: `Application ID: ${application.id}` });

    // Add a preview of the first answer if available
    if (application.answers.length > 0) {
        const preview =
            application.answers[0].answer.length > 100
                ? application.answers[0].answer.substring(0, 97) + "..."
                : application.answers[0].answer;
        embed.addFields({
            name: application.answers[0].question,
            value: preview,
            inline: false,
        });
    }

    // Add action buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_approve_${application.id}`)
            .setLabel("Approve")
            .setStyle("Success")
            .setEmoji("✅"),
        new ButtonBuilder()
            .setCustomId(`app_deny_${application.id}`)
            .setLabel("Deny")
            .setStyle("Danger")
            .setEmoji("❌"),
        new ButtonBuilder()
            .setCustomId(`app_view_${application.id}`)
            .setLabel("View Full")
            .setStyle("Secondary"),
    );

    await logChannel.send({
        content: `New application from <@${application.userId}> - <@&${application.role}>`,
        embeds: [embed],
        components: [row],
    });
}

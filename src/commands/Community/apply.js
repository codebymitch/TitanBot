import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Helper functions (these should ideally be imported from a centralized utility)
async function getApplicationSettings(client, guildId) {
    return client.db?.settings?.get(guildId) || {};
}

async function getUserApplications(client, guildId, userId) {
    // Mock implementation or import from DB handler
    return [];
}

async function createApplication(client, application) {
    // Mock implementation or import from DB handler
    return { id: 'temp-id' };
}

async function getApplication(client, guildId, appId) {
    // Mock implementation or import from DB handler
    return null;
}

// Migrated from: commands/Community/apply.js
export default {
    data: new SlashCommandBuilder()
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
        ),

    category: "Community",

    async execute(interaction) {
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
};

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

    // Create and show the application modal
    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${role.id}`)
        .setTitle(`Application for ${role.name}`);

    // Add text inputs for each question
    const questions =
        settings.questions || ["Why do you want this role?", "What is your experience?"];

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
}

async function handleStatus(interaction) {
    const appId = interaction.options.getString("id");

    if (appId) {
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

        const embed = createEmbed(
            `Application #${application.id} - ${application.roleName}`,
            `**Status:** ${application.status.charAt(0).toUpperCase() + application.status.slice(1)}`
        );

        return interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
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
            "Here are your recent applications."
        );

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

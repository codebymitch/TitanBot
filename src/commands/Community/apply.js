import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { 
    getApplicationSettings, 
    getUserApplications, 
    createApplication, 
    getApplication,
    getApplicationRoles,
    updateApplication
} from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Manage role applications")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("submit")
                .setDescription("Submit an application for a role")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("The application you want to submit")
                        .setRequired(true)
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
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("List available applications to apply for"),
        ),

    category: "Community",

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({
                embeds: [errorEmbed("This command can only be used in a server.")],
                flags: ["Ephemeral"],
            });
        }
const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        try {
            const settings = await getApplicationSettings(
                interaction.client,
                guild.id,
            );
            if (!settings.enabled) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Applications are currently disabled in this server.",
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            }

            if (subcommand === "submit") {
                await handleSubmit(interaction, settings);
            } else if (subcommand === "status") {
                await handleStatus(interaction);
            } else if (subcommand === "list") {
                await handleList(interaction);
            }
        } catch (error) {
            console.error("Error in apply command:", error);
            interaction.editReply({
                embeds: [
                    errorEmbed("An error occurred while processing your request."),
                ],
                flags: ["Ephemeral"],
            });
        }
    }
};

export async function handleApplicationModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_modal_')) return;
    
    const roleId = customId.split('_')[2];
    
    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    const applicationRole = applicationRoles.find(appRole => appRole.roleId === roleId);
    
    if (!applicationRole) {
        return interaction.editReply({
            embeds: [errorEmbed('Application configuration not found.')],
            flags: ["Ephemeral"]
        });
    }
    
    const role = interaction.guild.roles.cache.get(roleId);
    
    if (!role) {
        return interaction.editReply({
            embeds: [errorEmbed('Role not found.')],
            flags: ["Ephemeral"]
        });
    }
    
    const answers = [];
    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
    const questions = settings.questions || ["Why do you want this role?", "What is your experience?"];
    
    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`q${i}`);
        answers.push({
            question: questions[i],
            answer: answer
        });
    }
    
    try {
        const application = await createApplication(interaction.client, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            roleId: roleId,
            roleName: applicationRole.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });
        
        const embed = successEmbed(
            'Application Submitted',
            `Your application for **${applicationRole.name}** has been submitted successfully!\n\n` +
            `Application ID: \`${application.id}\`\n` +
            `You can check the status with \`/apply status id:${application.id}\``
        );
        
        await interaction.editReply({ embeds: [embed], flags: ["Ephemeral"] });
        
        const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
        if (settings.logChannelId) {
            const logChannel = interaction.guild.channels.cache.get(settings.logChannelId);
            if (logChannel) {
                const logEmbed = createEmbed({
                    title: '📝 New Application',
                    description: `**User:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
                        `**Application:** ${applicationRole.name}\n` +
                        `**Role:** ${role.name}\n` +
                        `**Application ID:** \`${application.id}\`\n` +
                        `**Status:** Pending`
                }).setColor('#FFFF00');
                
                const logMessage = await logChannel.send({ embeds: [logEmbed] });
                
                await updateApplication(interaction.client, interaction.guild.id, application.id, {
                    logMessageId: logMessage.id,
                    logChannelId: settings.logChannelId
                });
            }
        }
        
    } catch (error) {
        console.error('Error creating application:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                embeds: [errorEmbed('Failed to submit application. Please try again later.')],
                flags: ["Ephemeral"]
            });
        } else {
            await interaction.editReply({
                embeds: [errorEmbed('Failed to submit application. Please try again later.')],
                flags: ["Ephemeral"]
            });
        }
    }
}

async function handleList(interaction) {
    try {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length === 0) {
            return interaction.editReply({
                embeds: [errorEmbed("No applications are currently available.")],
                flags: ["Ephemeral"],
            });
        }

        const embed = createEmbed({
            title: "Available Applications",
            description: "Here are the roles you can apply for:"
        });

        applicationRoles.forEach((appRole, index) => {
            const role = interaction.guild.roles.cache.get(appRole.roleId);
            embed.addFields({
                name: `${index + 1}. ${appRole.name}`,
                value: `**Role:** ${role ? `<@&${appRole.roleId}>` : 'Role not found'}\n` +
                       `**Apply with:** \`/apply submit application:"${appRole.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "Use /apply submit application:<name> to apply for any of these roles."
        });

        return interaction.editReply({ embeds: [embed], flags: ["Ephemeral"] });
    } catch (error) {
        console.error('Error listing applications:', error);
        return interaction.editReply({
            embeds: [errorEmbed('Failed to load applications. Please try again later.')],
            flags: ["Ephemeral"]
        });
    }
}

async function handleSubmit(interaction, settings) {
    const applicationName = interaction.options.getString("application");
    const member = interaction.member;

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    
    const applicationRole = applicationRoles.find(appRole => 
        appRole.name.toLowerCase() === applicationName.toLowerCase()
    );

    if (!applicationRole) {
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    "Application not found.",
                    "Use `/apply list` to see available applications."
                ),
            ],
            flags: ["Ephemeral"],
        });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    `You already have a pending application. Please wait for it to be reviewed.`,
                ),
            ],
            flags: ["Ephemeral"],
        });
    }

    const role = interaction.guild.roles.cache.get(applicationRole.roleId);
    if (!role) {
        return interaction.editReply({
            embeds: [errorEmbed('The role for this application no longer exists.')],
            flags: ["Ephemeral"]
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRole.roleId}`)
        .setTitle(`Application for ${applicationRole.name}`);

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
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Application not found or you do not have permission to view it.",
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }

        const embed = createEmbed({ title: `Application #${application.id} - ${application.roleName}`, description: `**Status:** ${application.status.charAt(0).toUpperCase() + application.status.slice(1)}` });

        return interaction.editReply({ embeds: [embed], flags: ["Ephemeral"] });
    } else {
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return interaction.editReply({
                embeds: [
                    errorEmbed("You have not submitted any applications yet."),
                ],
                flags: ["Ephemeral"],
            });
        }

        const embed = createEmbed({ title: "Your Applications", description: "Here are your recent applications." });

        return interaction.editReply({ embeds: [embed], flags: ["Ephemeral"] });
    }
}




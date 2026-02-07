import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { 
    getApplicationSettings, 
    saveApplicationSettings, 
    getApplication, 
    getApplications, 
    updateApplication,
    getApplicationRoles,
    saveApplicationRoles
} from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
    .setName("app-admin")
    .setDescription("Manage staff applications")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
        subcommand
            .setName("setup")
            .setDescription("Configure application settings")
            .addChannelOption((option) =>
                option
                    .setName("log-channel")
                    .setDescription(
                        "Channel where new applications will be logged",
                    )
                    .setRequired(false),
            )
            .addRoleOption((option) =>
                option
                    .setName("manager-role")
                    .setDescription(
                        "Role that can manage applications (can be used multiple times)",
                    )
                    .setRequired(false),
            )
            .addBooleanOption((option) =>
                option
                    .setName("enabled")
                    .setDescription("Enable or disable applications")
                    .setRequired(false),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("view")
            .setDescription("View a specific application")
            .addStringOption((option) =>
                option
                    .setName("id")
                    .setDescription("The application ID")
                    .setRequired(true),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("review")
            .setDescription("Approve or deny an application")
            .addStringOption((option) =>
                option
                    .setName("id")
                    .setDescription("The application ID")
                    .setRequired(true),
            )
            .addStringOption((option) =>
                option
                    .setName("action")
                    .setDescription("Approve or deny the application")
                    .setRequired(true)
                    .addChoices(
                        { name: "Approve", value: "approve" },
                        { name: "Deny", value: "deny" },
                    ),
            )
            .addStringOption((option) =>
                option
                    .setName("reason")
                    .setDescription("Reason for approval/denial")
                    .setRequired(false),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("list")
            .setDescription("List all applications")
            .addStringOption((option) =>
                option
                    .setName("status")
                    .setDescription("Filter by status")
                    .addChoices(
                        { name: "Pending", value: "pending" },
                        { name: "Approved", value: "approved" },
                        { name: "Denied", value: "denied" },
                    ),
            )
            .addStringOption((option) =>
                option.setName("role").setDescription("Filter by role ID"),
            )
            .addUserOption((option) =>
                option.setName("user").setDescription("Filter by user"),
            )
            .addNumberOption((option) =>
                option
                    .setName("limit")
                    .setDescription(
                        "Maximum number of applications to show (default: 10)",
                    )
                    .setMinValue(1)
                    .setMaxValue(25),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("roles")
            .setDescription("Manage application roles")
            .addStringOption((option) =>
                option
                    .setName("action")
                    .setDescription("Action to perform")
                    .setRequired(true)
                    .addChoices(
                        { name: "Add Role", value: "add" },
                        { name: "Remove Role", value: "remove" },
                        { name: "List Roles", value: "list" }
                    )
            )
            .addRoleOption((option) =>
                option
                    .setName("role")
                    .setDescription("The role to add/remove")
                    .setRequired(false)
            )
            .addStringOption((option) =>
                option
                    .setName("name")
                    .setDescription("Custom name for the application")
                    .setRequired(false)
                    .setMaxLength(50)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("questions")
            .setDescription("Configure application questions")
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

        const settings = await getApplicationSettings(interaction.client, guild.id);
        const isManager =
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            (settings.managerRoles &&
                settings.managerRoles.some((roleId) =>
                    member.roles.cache.has(roleId),
                ));

        if (!isManager) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "You do not have permission to manage applications.",
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }

        try {
            if (subcommand === "setup") {
                await handleSetup(interaction, settings);
            } else if (subcommand === "view") {
                await handleView(interaction);
            } else if (subcommand === "review") {
                await handleReview(interaction);
            } else if (subcommand === "list") {
                await handleList(interaction);
            } else if (subcommand === "roles") {
                await handleRoles(interaction);
            } else if (subcommand === "questions") {
                await handleQuestions(interaction, settings);
            }
        } catch (error) {
            console.error("Error in app-admin command:", error);
            interaction.editReply({
                embeds: [
                    errorEmbed("An error occurred while processing your request."),
                ],
                flags: ["Ephemeral"],
            });
        }
    }
};

async function handleSetup(interaction, settings) {
    const logChannel = interaction.options.getChannel("log-channel");
    const managerRole = interaction.options.getRole("manager-role");
    const enabled = interaction.options.getBoolean("enabled");

    const updates = {};

    if (logChannel) {
        if (!logChannel.isTextBased()) {
            return interaction.editReply({
                embeds: [errorEmbed("The log channel must be a text channel.")],
                flags: ["Ephemeral"],
            });
        }
        updates.logChannelId = logChannel.id;
    }

    if (managerRole) {
        const managerRoles = new Set(settings.managerRoles || []);
        if (managerRoles.has(managerRole.id)) {
            managerRoles.delete(managerRole.id);
            updates.managerRoles = Array.from(managerRoles);
        } else {
            managerRoles.add(managerRole.id);
            updates.managerRoles = Array.from(managerRoles);
        }
    }

    if (enabled !== null) {
        updates.enabled = enabled;
    }

    if (Object.keys(updates).length === 0) {
        return showCurrentSettings(interaction, settings);
    }

    await saveApplicationSettings(
        interaction.client,
        interaction.guild.id,
        updates,
    );
    const updatedSettings = { ...settings, ...updates };

    await showCurrentSettings(interaction, updatedSettings);

}

async function showCurrentSettings(interaction, settings) {
    const embed = createEmbed({ title: "Application Settings", description: "Current configuration for the application system.", });

    embed.addFields(
        {
            name: "Status",
            value: settings.enabled ? "✅ Enabled" : "❌ Disabled",
            inline: true,
        },
        {
            name: "Log Channel",
            value: settings.logChannelId
                ? `<#${settings.logChannelId}>`
                : "Not set",
            inline: true,
        },
        {
            name: "Manager Roles",
            value:
                settings.managerRoles?.length > 0
                    ? settings.managerRoles.map((id) => `<@&${id}>`).join(", ")
                    : "Server Admins only",
            inline: false,
        },
        {
            name: "Default Questions",
            value:
                `There are ${settings.questions?.length || 0} default questions configured.\n` +
                `Use \`/app-admin questions\` to edit them.`,
            inline: false,
        },
    );

    await interaction.editReply({
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}

async function handleView(interaction) {
    const appId = interaction.options.getString("id");
    const application = await getApplication(
        interaction.client,
        interaction.guild.id,
        appId,
    );

    if (!application) {
        return interaction.editReply({
            embeds: [errorEmbed("Application not found.")],
            flags: ["Ephemeral"],
        });
    }

    const statusColor = application.status === "approved" ? "#00FF00" : (application.status === "denied" ? "#FF0000" : "#FFFF00");
    const embed = createEmbed({ title: `Application #${application.id} - ${application.roleName}`, description: `**User:** <@${application.userId}> (${application.userId})\n         **Status:** ${application.status.charAt(0).toUpperCase() + application.status.slice(1)}\n` +
            (application.reviewer
                ? `**Reviewed by:** <@${application.reviewer}>\n`
                : "") +
            (application.reviewMessage
                ? `**Note:** ${application.reviewMessage}\n`
                : "") +
            `**Submitted on:** ${new Date(application.createdAt).toLocaleString()}`,
        }).setColor(statusColor);

    if (application.avatar) {
        embed.setThumbnail(application.avatar);
    }

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

    if (application.status === "pending") {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`app_approve_${application.id}`)
                .setLabel("Approve")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅"),
            new ButtonBuilder()
                .setCustomId(`app_deny_${application.id}`)
                .setLabel("Deny")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌"),
        );

        await interaction.editReply({
            embeds: [embed],
            components: [row],
            flags: ["Ephemeral"],
        });
    } else {
        await interaction.editReply({
            embeds: [embed],
            flags: ["Ephemeral"],
        });
    }
}

async function handleReview(interaction) {
    const appId = interaction.options.getString("id");
    const action = interaction.options.getString("action");
    const reason =
        interaction.options.getString("reason") || "No reason provided.";

    const application = await getApplication(
        interaction.client,
        interaction.guild.id,
        appId,
    );
    if (!application) {
        return interaction.editReply({
            embeds: [errorEmbed("Application not found.")],
            flags: ["Ephemeral"],
        });
    }

    if (application.status !== "pending") {
        return interaction.editReply({
            embeds: [
                errorEmbed("This application has already been processed."),
            ],
            flags: ["Ephemeral"],
        });
    }

    const status = action === "approve" ? "approved" : "denied";
    const statusColor = status === "approved" ? "#00FF00" : "#FF0000";

    await updateApplication(interaction.client, interaction.guild.id, appId, {
        status,
        reviewer: interaction.user.id,
        reviewMessage: reason,
        reviewedAt: new Date().toISOString(),
    });

    try {
        const user = await interaction.client.users.fetch(application.userId);
        const dmEmbed = createEmbed(
            `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            `Your application for **${application.roleName}** has been **${status}**.\n` +
                `**Note:** ${reason}\n\n` +
                `Use \`/apply status id:${appId}\` to view details.`,
            statusColor,
        );

        await user.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.error("Error sending DM to user:", error);
    }

    if (application.logMessageId && application.logChannelId) {
        try {
            const logChannel = interaction.guild.channels.cache.get(
                application.logChannelId,
            );
            if (logChannel) {
                const logMessage = await logChannel.messages.fetch(
                    application.logMessageId,
                );
                if (logMessage) {
                    const embed = logMessage.embeds[0];
                    if (embed) {
                        const newEmbed = EmbedBuilder.from(embed)
                            .setColor(statusColor)
                            .spliceFields(0, 1, {
                                name: "Status",
                                value:
                                    status.charAt(0).toUpperCase() +
                                    status.slice(1),
                            });

                        await logMessage.edit({
                            embeds: [newEmbed],
components: [],
                        });
                    }
                }
            }
        } catch (error) {
            console.error("Error updating log message:", error);
        }
    }

    if (action === "approve") {
        try {
            const member = await interaction.guild.members.fetch(
                application.userId,
            );
            await member.roles.add(application.role);
        } catch (error) {
            console.error("Error assigning role:", error);
        }
    }

    await interaction.editReply({
        embeds: [
            successEmbed(
                `Application ${status}`,
                `The application has been ${status}.`,
            ),
        ],
        flags: ["Ephemeral"],
    });
}

async function handleList(interaction) {
    const status = interaction.options.getString("status");
    const user = interaction.options.getUser("user");
    const limit = interaction.options.getNumber("limit") || 10;

    const filters = {};
    if (status) filters.status = status;

    let applications = await getApplications(
        interaction.client,
        interaction.guild.id,
        filters,
    );

    if (user) {
        applications = applications.filter((app) => app.userId === user.id);
    }

    if (applications.length === 0) {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length > 0) {
            const embed = createEmbed({ 
                title: "No Applications Found", 
                description: "No submitted applications found matching the specified criteria.\n\nHowever, the following application roles are configured:" 
            });

            applicationRoles.forEach((appRole, index) => {
                const role = interaction.guild.roles.cache.get(appRole.roleId);
                embed.addFields({
                    name: `${index + 1}. ${appRole.name}`,
                    value: `**Role:** ${role ? `<@&${appRole.roleId}>` : 'Role not found'}\n**Available for applications:** Yes`,
                    inline: false
                });
            });

            embed.setFooter({
                text: "Users can apply with /apply submit or see available roles with /apply list"
            });

            return interaction.editReply({ embeds: [embed], flags: ["Ephemeral"] });
        } else {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "No applications found and no application roles configured.\n" +
                        "Use `/app-admin roles add` to configure application roles first."
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }
    }

    applications = applications
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

    const embed = createEmbed({ title: "Submitted Applications", description: `Showing ${applications.length} applications.`, });

    applications.forEach((app) => {
        const status = app.status.charAt(0).toUpperCase() + app.status.slice(1);
        const statusEmoji =
            {
                Pending: "🟡",
                Approved: "🟢",
                Denied: "🔴",
            }[status] || "⚪";

        embed.addFields({
            name: `${statusEmoji} ${app.roleName} - ${app.username}`,
            value:
                `**ID:** \`${app.id}\`\n` +
                `**Status:** ${status}\n` +
                `**Date:** ${new Date(app.createdAt).toLocaleString()}`,
            inline: true,
        });
    });

    await interaction.editReply({
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}

async function handleQuestions(interaction, settings) {
    const modal = new ModalBuilder()
        .setCustomId("edit_questions")
        .setTitle("Edit Application Questions");

    const questions =
        settings.questions || ["Question 1", "Question 2"];

    for (let i = 0; i < 5; i++) {
        const input = new TextInputBuilder()
            .setCustomId(`q${i}`)
            .setLabel(`Question ${i + 1}`)
            .setStyle(TextInputStyle.Short)
.setRequired(i === 0)
            .setValue(questions[i] || "");

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
    }

    await interaction.showModal(modal);

    try {
        const modalResponse = await interaction.awaitModalSubmit({
time: 30 * 60 * 1000,
            filter: (i) =>
                i.customId === "edit_questions" &&
                i.user.id === interaction.user.id,
        });

        const newQuestions = [];
        for (let i = 0; i < 5; i++) {
            const question = modalResponse.fields
                .getTextInputValue(`q${i}`)
                .trim();
            if (question) {
                newQuestions.push(question);
            }
        }

        if (newQuestions.length === 0) {
            return modalResponse.reply({
                embeds: [errorEmbed("You must provide at least one question.")],
                flags: ["Ephemeral"],
            });
        }

        await saveApplicationSettings(
            interaction.client,
            interaction.guild.id,
            {
                questions: newQuestions,
            },
        );

        await modalResponse.reply({
            embeds: [
                successEmbed(
                    "Questions Updated",
                    `The application questions have been updated.\n\n` +
                        newQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
                ),
            ],
            flags: ["Ephemeral"],
        });
    } catch (error) {
        if (error.message.includes("timeout")) {
            return;
        }
        console.error("Error processing questions:", error);
    }
}

async function handleRoles(interaction) {
    const action = interaction.options.getString("action");
    const role = interaction.options.getRole("role");
    const name = interaction.options.getString("name");

    try {
        const currentRoles = await getApplicationRoles(interaction.client, interaction.guild.id);

        if (action === "list") {
            if (currentRoles.length === 0) {
                return interaction.editReply({
                    embeds: [errorEmbed("No application roles have been configured.")],
                    flags: ["Ephemeral"],
                });
            }

            const embed = createEmbed({
                title: "Application Roles",
                description: "Here are the configured application roles:"
            });

            currentRoles.forEach((appRole, index) => {
                const roleObj = interaction.guild.roles.cache.get(appRole.roleId);
                embed.addFields({
                    name: `${index + 1}. ${appRole.name}`,
                    value: `**Role:** ${roleObj ? `<@&${appRole.roleId}>` : 'Role not found'}\n**ID:** \`${appRole.roleId}\``,
                    inline: false
                });
            });

            return interaction.editReply({ embeds: [embed], flags: ["Ephemeral"] });
        }

        if (action === "add") {
            if (!role) {
                return interaction.editReply({
                    embeds: [errorEmbed("You must specify a role to add.")],
                    flags: ["Ephemeral"],
                });
            }

            const customName = name || role.name;
            
            if (currentRoles.some(appRole => appRole.roleId === role.id)) {
                return interaction.editReply({
                    embeds: [errorEmbed("This role is already configured for applications.")],
                    flags: ["Ephemeral"],
                });
            }

            currentRoles.push({
                roleId: role.id,
                name: customName
            });

            await saveApplicationRoles(interaction.client, interaction.guild.id, currentRoles);

            return interaction.editReply({
                embeds: [successEmbed(
                    "Role Added",
                    `**${customName}** has been added to the application system.\nUsers can now apply for this role using \`/apply submit\`.`
                )],
                flags: ["Ephemeral"],
            });
        }

        if (action === "remove") {
            if (!role) {
                return interaction.editReply({
                    embeds: [errorEmbed("You must specify a role to remove.")],
                    flags: ["Ephemeral"],
                });
            }

            const roleIndex = currentRoles.findIndex(appRole => appRole.roleId === role.id);
            if (roleIndex === -1) {
                return interaction.editReply({
                    embeds: [errorEmbed("This role is not configured for applications.")],
                    flags: ["Ephemeral"],
                });
            }

            const removedRole = currentRoles.splice(roleIndex, 1)[0];
            await saveApplicationRoles(interaction.client, interaction.guild.id, currentRoles);

            return interaction.editReply({
                embeds: [successEmbed(
                    "Role Removed",
                    `**${removedRole.name}** has been removed from the application system.`
                )],
                flags: ["Ephemeral"],
            });
        }
    } catch (error) {
        console.error("Error handling roles command:", error);
        return interaction.editReply({
            embeds: [errorEmbed("An error occurred while managing application roles.")],
            flags: ["Ephemeral"],
        });
    }
}

export async function handleApplicationButton(interaction) {
    if (!interaction.isButton()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_approve_') && !customId.startsWith('app_deny_')) return;
    
    const [action, appId] = customId.split('_');
    const isApprove = action === 'app';
    
    try {
        const application = await getApplication(interaction.client, interaction.guild.id, appId);
        if (!application) {
            return interaction.reply({
                embeds: [errorEmbed('Application not found.')],
                flags: ["Ephemeral"]
            });
        }
        
        if (application.status !== 'pending') {
            return interaction.reply({
                embeds: [errorEmbed('This application has already been processed.')],
                flags: ["Ephemeral"]
            });
        }
        
        const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
        const isManager = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            (settings.managerRoles && settings.managerRoles.some(roleId => interaction.member.roles.cache.has(roleId)));
        
        if (!isManager) {
            return interaction.reply({
                embeds: [errorEmbed('You do not have permission to manage applications.')],
                flags: ["Ephemeral"]
            });
        }
        
        const modal = new ModalBuilder()
            .setCustomId(`app_review_${appId}_${isApprove ? 'approve' : 'deny'}`)
            .setTitle(`${isApprove ? 'Approve' : 'Deny'} Application`)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('reason')
                        .setLabel('Reason (optional)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(500)
                )
            );
        
        await interaction.showModal(modal);
        
    } catch (error) {
        console.error('Error handling application button:', error);
        await interaction.editReply({
            embeds: [errorEmbed('An error occurred while processing the application.')],
            flags: ["Ephemeral"]
        });
    }
}

export async function handleApplicationReviewModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_review_')) return;
    
    const [, appId, action] = customId.split('_');
    const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided.';
    const isApprove = action === 'approve';
    
    try {
        const application = await getApplication(interaction.client, interaction.guild.id, appId);
        if (!application) {
            return interaction.reply({
                embeds: [errorEmbed('Application not found.')],
                flags: ["Ephemeral"]
            });
        }
        
        const status = isApprove ? 'approved' : 'denied';
        await updateApplication(interaction.client, interaction.guild.id, appId, {
            status,
            reviewer: interaction.user.id,
            reviewMessage: reason,
            reviewedAt: new Date().toISOString()
        });
        
        try {
            const user = await interaction.client.users.fetch(application.userId);
            const dmEmbed = createEmbed(
                `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                `Your application for **${application.roleName}** has been **${status}**.\n` +
                `**Note:** ${reason}\n\n` +
                `Use \`/apply status id:${appId}\` to view details.`,
                isApprove ? '#00FF00' : '#FF0000'
            );
            
            await user.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.error('Error sending DM to user:', error);
        }
        
        if (application.logMessageId && application.logChannelId) {
            try {
                const logChannel = interaction.guild.channels.cache.get(application.logChannelId);
                if (logChannel) {
                    const logMessage = await logChannel.messages.fetch(application.logMessageId);
                    if (logMessage) {
                        const embed = logMessage.embeds[0];
                        if (embed) {
                            const newEmbed = EmbedBuilder.from(embed)
                                .setColor(isApprove ? '#00FF00' : '#FF0000')
                                .spliceFields(0, 1, {
                                    name: 'Status',
                                    value: status.charAt(0).toUpperCase() + status.slice(1)
                                });
                            
                            await logMessage.edit({
                                embeds: [newEmbed],
                                components: []
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Error updating log message:', error);
            }
        }
        
        if (isApprove) {
            try {
                const member = await interaction.guild.members.fetch(application.userId);
                await member.roles.add(application.role);
            } catch (error) {
                console.error('Error assigning role:', error);
            }
        }
        
        await interaction.editReply({
            embeds: [
                successEmbed(
                    `Application ${status}`,
                    `The application has been ${status}.`
                )
            ],
            flags: ["Ephemeral"]
        });
        
    } catch (error) {
        console.error('Error processing application review:', error);
        await interaction.editReply({
            embeds: [errorEmbed('An error occurred while processing the application.')],
            flags: ["Ephemeral"]
        });
    }
}

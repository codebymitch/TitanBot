import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { ContextualMessages, MessageTemplates } from '../../utils/messageTemplates.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("Manage the server verification system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Set up the verification system")
                .addChannelOption(option =>
                    option
                        .setName("verification_channel")
                        .setDescription("Channel where verification messages will be sent")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("verified_role")
                        .setDescription("Role to give to verified users")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("message")
                        .setDescription("Custom verification message")
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription("Text for the verification button")
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("verify")
                .setDescription("Verify yourself (for users to use)")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove verification from a user")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("User to remove verification from")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription("Disable the verification system")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription("Check verification system status")
        ),

    async execute(interaction, config, client) {
        return withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "verify":
                    return await handleVerify(interaction, guild, client);
                case "remove":
                    return await handleRemove(interaction, guild, client);
                case "disable":
                    return await handleDisable(interaction, guild, client);
                case "status":
                    return await handleStatus(interaction, guild, client);
                default:
                    throw createError(
                        `Unknown subcommand: ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        "Please select a valid subcommand.",
                        { subcommand }
                    );
            }
        }, { command: 'verification', subcommand: interaction.options.getSubcommand() });
    }
};

async function handleSetup(interaction, guild, client) {
    const verificationChannel = interaction.options.getChannel("verification_channel");
    const verifiedRole = interaction.options.getRole("verified_role");
    const message = interaction.options.getString("message") || "Click the button below to verify yourself and gain access to the server!";
    const buttonText = interaction.options.getString("button_text") || "Verify";

    const requiredPermissions = ["SendMessages", "EmbedLinks"];
    const missingChannelPerms = requiredPermissions.filter(perm => 
        !verificationChannel.permissionsFor(guild.members.me).has(perm)
    );
    
    if (missingChannelPerms.length > 0) {
        throw createError(
            `Missing channel permissions: ${missingChannelPerms.join(', ')}`,
            ErrorTypes.PERMISSION,
            `I need the following permissions in the verification channel: ${missingChannelPerms.join(', ')}`,
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!guild.members.me.permissions.has("ManageRoles")) {
        throw createError(
            "Missing ManageRoles permission",
            ErrorTypes.PERMISSION,
            "I need the 'Manage Roles' permission to give verified roles.",
            { missingPermission: "ManageRoles" }
        );
    }

    const botRole = guild.members.me.roles.highest;
    if (verifiedRole.position >= botRole.position) {
        throw createError(
            "Role hierarchy error",
            ErrorTypes.PERMISSION,
            "The verified role must be below my highest role in the server role hierarchy.",
            { rolePosition: verifiedRole.position, botRolePosition: botRole.position }
        );
    }

    await interaction.deferReply();

    const verifyEmbed = createEmbed({
        title: "✅ Server Verification",
        description: message,
        color: "#00FF00"
    });

    const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_user")
            .setLabel(buttonText)
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅")
    );

    const verifyMessage = await verificationChannel.send({
        embeds: [verifyEmbed],
        components: [verifyButton]
    });

    const guildConfig = await getGuildConfig(client, guild.id);
    guildConfig.verification = {
        enabled: true,
        channelId: verificationChannel.id,
        messageId: verifyMessage.id,
        roleId: verifiedRole.id,
        message: message,
        buttonText: buttonText
    };

    await setGuildConfig(client, guild.id, guildConfig);

    await interaction.editReply({
        embeds: [ContextualMessages.configUpdated(
            "Verification System",
            [
                `Channel: ${verificationChannel}`,
                `Verified Role: ${verifiedRole}`,
                `Button Text: ${buttonText}`
            ]
        )]
    });
}

async function handleVerify(interaction, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.enabled) {
        throw createError(
            "Verification system is disabled",
            ErrorTypes.CONFIGURATION,
            "The verification system is not enabled on this server.",
            { feature: 'verification', status: 'disabled' }
        );
    }

    const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
    if (!verifiedRole) {
        throw createError(
            "Verified role not found",
            ErrorTypes.CONFIGURATION,
            "Verified role not found. Please contact an administrator.",
            { roleId: guildConfig.verification.roleId }
        );
    }

    const member = interaction.member;

    if (member.roles.cache.has(verifiedRole.id)) {
        return await interaction.reply({
            embeds: [MessageTemplates.INFO.ALREADY_CONFIGURED("verified")],
            flags: MessageFlags.Ephemeral
        });
    }

    await member.roles.add(verifiedRole.id, "User verified themselves");
    
    await interaction.reply({
        embeds: [MessageTemplates.SUCCESS.ACTION_COMPLETE(
            `You have been verified and given the **${verifiedRole.name}** role! Welcome to the server! 🎉`
        )],
        flags: MessageFlags.Ephemeral
    });
}

async function handleRemove(interaction, guild, client) {
    const targetUser = interaction.options.getUser("user");
    const targetMember = guild.members.cache.get(targetUser.id);

    if (!targetMember) {
        throw createError(
            `User ${targetUser.tag} not found in guild`,
            ErrorTypes.USER_INPUT,
            `The specified user is not in this server.`,
            { userId: targetUser.id, userTag: targetUser.tag }
        );
    }

    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.enabled) {
        throw createError(
            "Verification system is disabled",
            ErrorTypes.CONFIGURATION,
            "The verification system is not enabled on this server.",
            { feature: 'verification', status: 'disabled' }
        );
    }

    const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
    if (!verifiedRole) {
        throw createError(
            "Verified role not found",
            ErrorTypes.CONFIGURATION,
            "Verified role not found. Please contact an administrator.",
            { roleId: guildConfig.verification.roleId }
        );
    }

    if (!targetMember.roles.cache.has(verifiedRole.id)) {
        return await interaction.reply({
            embeds: [MessageTemplates.INFO.NO_DATA("verification role on this user")],
            flags: MessageFlags.Ephemeral
        });
    }

    await targetMember.roles.remove(verifiedRole.id, `Verification removed by ${interaction.user.tag}`);
    
    await interaction.reply({
        embeds: [MessageTemplates.SUCCESS.OPERATION_COMPLETE(
            `Successfully removed verification from ${targetUser.tag}.`
        )]
    });
}

async function handleDisable(interaction, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.enabled) {
        return await interaction.reply({
            embeds: [MessageTemplates.INFO.ALREADY_CONFIGURED("disabled")],
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply();

    if (guildConfig.verification.channelId && guildConfig.verification.messageId) {
        const channel = guild.channels.cache.get(guildConfig.verification.channelId);
        if (channel) {
            try {
                const message = await channel.messages.fetch(guildConfig.verification.messageId);
                if (message) {
                    await message.delete();
                }
            } catch (error) {
                logger.info("Could not delete verification message (may have been deleted already):", error.message);
            }
        }
    }

    guildConfig.verification.enabled = false;
    await setGuildConfig(client, guild.id, guildConfig);

    await interaction.editReply({
        embeds: [MessageTemplates.SUCCESS.OPERATION_COMPLETE(
            "The verification system has been disabled and the verification message has been removed."
        )]
    });
}

async function handleStatus(interaction, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.enabled) {
        return await interaction.reply({
            embeds: [infoEmbed(
                "Verification Status",
                "🔴 **Status:** Disabled\n\nThe verification system is not currently enabled on this server.\n\nUse `/verification setup` to enable it."
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    const verificationChannel = guild.channels.cache.get(guildConfig.verification.channelId);
    const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);

    const statusEmbed = createEmbed({
        title: "✅ Verification System Status",
        description: "Current verification system configuration:",
        color: "#00FF00"
    })
    .addFields(
        {
            name: "📢 Verification Channel",
            value: verificationChannel ? verificationChannel.toString() : "Not found",
            inline: true
        },
        {
            name: "🏷️ Verified Role",
            value: verifiedRole ? verifiedRole.toString() : "Not found",
            inline: true
        },
        {
            name: "🔘 Button Text",
            value: guildConfig.verification.buttonText || "Verify",
            inline: true
        },
        {
            name: "📝 Custom Message",
            value: guildConfig.verification.message ? "✅ Configured" : "❌ Not set",
            inline: true
        },
        {
            name: "👥 Verified Users",
            value: verifiedRole ? `${verifiedRole.members.size} users` : "Unknown",
            inline: true
        }
    );

    await interaction.reply({
        embeds: [statusEmbed],
        flags: MessageFlags.Ephemeral
    });
}





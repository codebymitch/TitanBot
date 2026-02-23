import { botConfig, getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { removeVerification, verifyUser } from '../../services/verificationService.js';
import { ContextualMessages, MessageTemplates } from '../../utils/messageTemplates.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("Manage the server verification system")
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
                        .setMaxLength(2000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription("Text for the verification button")
                        .setMaxLength(80)
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

            if (subcommand !== 'verify' && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Missing ManageGuild permission for verification admin subcommand',
                    ErrorTypes.PERMISSION,
                    'You need the **Manage Server** permission to use this verification subcommand.',
                    { subcommand, requiredPermission: 'ManageGuild', userId: interaction.user.id }
                );
            }

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
    const message = interaction.options.getString("message") || botConfig.verification.defaultMessage;
    const buttonText = interaction.options.getString("button_text") || botConfig.verification.defaultButtonText;
    const botMember = guild.members.me;

    if (!botMember) {
        throw createError(
            'Bot member not found in guild cache',
            ErrorTypes.CONFIGURATION,
            'I could not verify my permissions in this server. Please try again in a moment.',
            { guildId: guild.id }
        );
    }

    const requiredChannelPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ];
    const missingChannelPerms = requiredChannelPermissions.filter(perm => 
        !verificationChannel.permissionsFor(botMember).has(perm)
    );
    
    if (missingChannelPerms.length > 0) {
        throw createError(
            `Missing channel permissions: ${missingChannelPerms.join(', ')}`,
            ErrorTypes.PERMISSION,
            'I need **View Channel**, **Send Messages**, and **Embed Links** in the verification channel.',
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            "Missing ManageRoles permission",
            ErrorTypes.PERMISSION,
            "I need the 'Manage Roles' permission to give verified roles.",
            { missingPermission: "ManageRoles" }
        );
    }

    const botRole = botMember.roles.highest;
    if (verifiedRole.position >= botRole.position) {
        throw createError(
            "Role hierarchy error",
            ErrorTypes.PERMISSION,
            "The verified role must be below my highest role in the server role hierarchy.",
            { rolePosition: verifiedRole.position, botRolePosition: botRole.position }
        );
    }

    await InteractionHelper.safeDefer(interaction);

    const verifyEmbed = createEmbed({
        title: "✅ Server Verification",
        description: message,
        color: getColor('success')
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

    await InteractionHelper.safeEditReply(interaction, {
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
    const result = await verifyUser(client, guild.id, interaction.user.id, {
        source: 'command_self',
        moderatorId: null
    });

    if (!result.success) {
        if (result.alreadyVerified) {
            return await InteractionHelper.safeReply(interaction, {
                embeds: [MessageTemplates.INFO.ALREADY_CONFIGURED("verified")],
                flags: MessageFlags.Ephemeral
            });
        }

        return await InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed(
                "Verification Failed",
                "An error occurred during verification. Please try again or contact an administrator."
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    await InteractionHelper.safeReply(interaction, {
        embeds: [MessageTemplates.SUCCESS.ACTION_COMPLETE(
            `You have been verified and given the **${result.roleName}** role! Welcome to the server! 🎉`
        )],
        flags: MessageFlags.Ephemeral
    });
}

async function handleRemove(interaction, guild, client) {
    const targetUser = interaction.options.getUser("user");
    
    try {
        const result = await removeVerification(client, guild.id, targetUser.id, {
            moderatorId: interaction.user.id,
            reason: 'admin_removal'
        });

        if (!result.success) {
            if (result.notVerified) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [MessageTemplates.INFO.NO_DATA("verified role")],
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        logger.info('Verification removed via command', {
            guildId: guild.id,
            targetUserId: targetUser.id,
            moderatorId: interaction.user.id
        });

        return await InteractionHelper.safeReply(interaction, {
            embeds: [MessageTemplates.SUCCESS.OPERATION_COMPLETE(
                `Verification removed from ${targetUser.tag}.`
            )]
        });

    } catch (error) {
        await handleInteractionError(
            interaction,
            error,
            { command: 'verification', subcommand: 'remove' }
        );
    }
}

async function handleDisable(interaction, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.enabled) {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [MessageTemplates.INFO.ALREADY_CONFIGURED("disabled")],
            flags: MessageFlags.Ephemeral
        });
    }

    await InteractionHelper.safeDefer(interaction);

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

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [MessageTemplates.SUCCESS.OPERATION_COMPLETE(
            "The verification system has been disabled and the verification message has been removed."
        )]
    });
}

async function handleStatus(interaction, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.enabled) {
        return await InteractionHelper.safeReply(interaction, {
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
        color: getColor('success')
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

    await InteractionHelper.safeReply(interaction, {
        embeds: [statusEmbed],
        flags: MessageFlags.Ephemeral
    });
}





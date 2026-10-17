import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Guild, TextChannel } from 'discord.js';
import { createEmbed, infoEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { removeVerification, verifyUser } from '../../../services/verificationService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import verificationDashboard from './verification_dashboard.js';
import type { Command, NexoClient } from '../../../types/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription('Das Verifizierungssystem des Servers verwalten')
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription('Das Verifizierungssystem einrichten')
                .addChannelOption(option =>
                    option
                        .setName("verification_channel")
                        .setDescription('Kanal, in dem die Verifizierungsnachricht gesendet wird')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("verified_role")
                        .setDescription('Rolle, die verifizierte Nutzer erhalten')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("message")
                        .setDescription('Eigene Verifizierungsnachricht')
                        .setMaxLength(2000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription('Text für den Verifizierungs-Button')
                        .setMaxLength(80)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription('Die Verifizierung eines Nutzers entfernen')
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription('Nutzer, dessen Verifizierung entfernt wird')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription('Das Dashboard für die Verifizierung öffnen')
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async (..._args: unknown[]) => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild!;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Missing ManageGuild permission for verification admin subcommand',
                    ErrorTypes.PERMISSION,
                    'Du brauchst die Berechtigung **Server verwalten**, um diesen Verifizierungs-Subcommand zu nutzen.',
                    { subcommand, requiredPermission: 'ManageGuild', userId: interaction.user.id }
                );
            }

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "remove":
                    return await handleRemove(interaction, guild, client);
                case "dashboard":
                    return await verificationDashboard.execute(interaction, config, client);
                default:
                    throw createError(
                        `Unknown subcommand: ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        'Bitte wähle einen gültigen Subcommand.',
                        { subcommand }
                    );
            }
        }, { command: 'verification', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
} satisfies Command;

async function handleSetup(interaction: ChatInputCommandInteraction, guild: Guild, client: NexoClient) {
    const verificationChannel = interaction.options.getChannel("verification_channel") as TextChannel;
    const verifiedRole = interaction.options.getRole("verified_role")!;
    const message = interaction.options.getString("message") || botConfig.verification.defaultMessage;
    const buttonText = interaction.options.getString("button_text") || botConfig.verification.defaultButtonText;
    const botMember = guild.members.me;

    if (!botMember) {
        throw createError(
            'Bot member not found in guild cache',
            ErrorTypes.CONFIGURATION,
            'Ich konnte meine Berechtigungen auf diesem Server nicht prüfen. Bitte versuch es gleich noch einmal.',
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
            'Ich brauche **Kanal ansehen**, **Nachrichten senden** und **Links einbetten** im Verifizierungskanal.',
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            "Missing ManageRoles permission",
            ErrorTypes.PERMISSION,
            'Ich brauche die Berechtigung „Rollen verwalten“, um die Verifizierungsrolle zu vergeben.',
            { missingPermission: "ManageRoles" }
        );
    }

    if (verifiedRole.id === guild.id || verifiedRole.managed) {
        throw createError(
            'Invalid verified role selected',
            ErrorTypes.VALIDATION,
            'Bitte wähle eine normale, vergebbare Rolle (nicht @everyone und keine von einer Integration verwaltete Rolle).',
            { roleId: verifiedRole.id, managed: verifiedRole.managed }
        );
    }

    const botRole = botMember.roles.highest;
    if (verifiedRole.position >= botRole.position) {
        throw createError(
            "Role hierarchy error",
            ErrorTypes.PERMISSION,
            'Die Verifizierungsrolle muss in der Rollenhierarchie unter meiner höchsten Rolle liegen.',
            { rolePosition: verifiedRole.position, botRolePosition: botRole.position }
        );
    }

    const guildConfig = await getGuildConfig(client, guild.id);
    const welcomeConfig = await getWelcomeConfig(client, guild.id);
    const hasAutoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
    const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

    if (hasAutoVerifyEnabled || hasAutoRoleConfigured) {
        throw createError(
            'Verification setup blocked by conflicting onboarding system',
            ErrorTypes.CONFIGURATION,
            'Du kannst das Verifizierungssystem nicht aktivieren, solange **AutoVerify** oder eine **Auto-Rolle** eingerichtet ist. Deaktiviere diese zuerst.',
            {
                guildId: guild.id,
                hasAutoVerifyEnabled,
                hasAutoRoleConfigured,
                expected: true,
                suppressErrorLog: true
            }
        );
    }

    await InteractionHelper.safeDefer(interaction);

    const verifyEmbed = createEmbed({
        title: 'Server-Verifizierung',
        description: message,
        color: getColor('success')
    });

    const verifyButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
        embeds: [successEmbed(
            'Verifizierungssystem aktualisiert',
            [
                `Kanal: ${verificationChannel}`,
                `Verifizierungsrolle: ${verifiedRole}`,
                `Button-Text: ${buttonText}`
            ].join('\n')
        )]
    });
}

async function handleRemove(interaction: ChatInputCommandInteraction, guild: Guild, client: NexoClient) {
    const targetUser = interaction.options.getUser("user")!;

    const result = await removeVerification(client, guild.id, targetUser.id, {
        moderatorId: interaction.user.id,
        reason: 'admin_removal'
    });

    if (result.status === 'not_verified') {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [infoEmbed('Nicht verifiziert', `${targetUser.tag} hat die Verifizierungsrolle derzeit nicht.`)],
            flags: MessageFlags.Ephemeral
        });
    }

    logger.info('Verification removed via command', {
        guildId: guild.id,
        targetUserId: targetUser.id,
        moderatorId: interaction.user.id
    });

    return await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Verifizierung entfernt', `Die Verifizierung von ${targetUser.tag} wurde entfernt.`)]
    });
}
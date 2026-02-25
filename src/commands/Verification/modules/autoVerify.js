import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { validateAutoVerifyCriteria } from '../../../services/verificationService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../../utils/database.js';

const autoVerifyDefaults = botConfig.verification?.autoVerify || {};
const minAccountAgeDays = autoVerifyDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifyDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifyDefaults.defaultAccountAgeDays ?? 7;
const serverSizeThreshold = autoVerifyDefaults.serverSizeThreshold ?? 1000;

export default {
    data: new SlashCommandBuilder()
        .setName("autoverify")
        .setDescription("Configure automatic verification settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Set up automatic verification")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Role to assign to users who meet auto-verify criteria")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("criteria")
                        .setDescription("Criteria for automatic verification")
                        .addChoices(
                            { name: `Account Age (older than ${defaultAccountAgeDays} days)`, value: "account_age" },
                            { name: `Server Members (less than ${serverSizeThreshold} members)`, value: "server_size" },
                            { name: "No Criteria (verify everyone)", value: "none" }
                        )
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("account_age_days")
                        .setDescription("Minimum account age in days (for account age criteria)")
                        .setMinValue(minAccountAgeDays)
                        .setMaxValue(maxAccountAgeDays)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription("Disable automatic verification")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription("Check automatic verification status")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "disable":
                    return await handleDisable(interaction, guild, client);
                case "status":
                    return await handleStatus(interaction, guild, client);
                default:
                    throw createError(
                        `Unknown subcommand: ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        "Invalid subcommand selected.",
                        { subcommand }
                    );
            }
        }, { command: 'autoverify', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const criteria = interaction.options.getString("criteria");
    const accountAgeDays = interaction.options.getInteger("account_age_days") || defaultAccountAgeDays;
    const targetRole = interaction.options.getRole("role");

    await InteractionHelper.safeDefer(interaction);

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        const welcomeConfig = await getWelcomeConfig(client, guild.id);
        const verificationEnabled = Boolean(guildConfig.verification?.enabled);
        const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

        if (verificationEnabled || hasAutoRoleConfigured) {
            throw createError(
                'Auto-verify enable blocked by conflicting onboarding system',
                ErrorTypes.CONFIGURATION,
                'You cannot enable **AutoVerify** while the verification system or AutoRole is configured. Disable those first.',
                {
                    guildId: guild.id,
                    verificationEnabled,
                    hasAutoRoleConfigured,
                    expected: true,
                    suppressErrorLog: true
                }
            );
        }

        const botMember = guild.members.me;
        if (!botMember) {
            throw createError(
                'Bot member not found in guild cache',
                ErrorTypes.CONFIGURATION,
                'I could not verify my permissions in this server. Please try again in a moment.',
                { guildId: guild.id }
            );
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw createError(
                'Missing ManageRoles permission',
                ErrorTypes.PERMISSION,
                "I need the 'Manage Roles' permission to assign auto-verify roles.",
                { guildId: guild.id }
            );
        }

        if (targetRole.id === guild.id || targetRole.managed) {
            throw createError(
                'Invalid auto-verify role selected',
                ErrorTypes.VALIDATION,
                'Please choose a normal assignable role (not @everyone or an integration-managed role).',
                { guildId: guild.id, roleId: targetRole.id, managed: targetRole.managed }
            );
        }

        if (targetRole.position >= botMember.roles.highest.position) {
            throw createError(
                'Role hierarchy error for auto-verify setup',
                ErrorTypes.PERMISSION,
                'The selected auto-verify role must be below my highest role in the server role hierarchy.',
                { guildId: guild.id, roleId: targetRole.id, rolePosition: targetRole.position, botRolePosition: botMember.roles.highest.position }
            );
        }

        
        validateAutoVerifyCriteria(criteria, criteria === 'account_age' ? accountAgeDays : 1);
        
        if (!guildConfig.verification) {
            guildConfig.verification = {};
        }

        guildConfig.verification.autoVerify = {
            enabled: true,
            criteria: criteria,
            accountAgeDays: criteria === "account_age" ? accountAgeDays : null,
            roleId: targetRole.id,
            configuredVia: 'setup'
        };

        await setGuildConfig(client, guild.id, guildConfig);

        let criteriaDescription = "";
        switch (criteria) {
            case "account_age":
                criteriaDescription = `Accounts older than ${accountAgeDays} days`;
                break;
            case "server_size":
                criteriaDescription = `All users (server has less than ${serverSizeThreshold} members)`;
                break;
            case "none":
                criteriaDescription = "All users immediately";
                break;
        }

        logger.info('Auto-verify enabled', {
            guildId: guild.id,
            criteria,
            accountAgeDays: criteria === 'account_age' ? accountAgeDays : null,
            roleId: targetRole.id
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "Auto-Verification Configured",
                `Automatic verification has been configured!\n\n**Role:** ${targetRole}\n**Criteria:** ${criteriaDescription}\n\nUsers who meet these criteria will receive this role when they join the server.`
            )]
        });

    } catch (error) {
        
        throw error;
    }
}

async function handleDisable(interaction, guild, client) {
    await InteractionHelper.safeDefer(interaction);

    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.autoVerify?.enabled) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed("Already Disabled", "Auto-verification is already disabled.")],
        });
    }

    guildConfig.verification.autoVerify.enabled = false;
    await setGuildConfig(client, guild.id, guildConfig);

    logger.info('Auto-verify disabled', { guildId: guild.id });

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            "Auto-Verification Disabled",
            "Automatic verification has been disabled. Users will now need to verify manually."
        )]
    });
}

async function handleStatus(interaction, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    const welcomeConfig = await getWelcomeConfig(client, guild.id);
    const verificationEnabled = Boolean(guildConfig.verification?.enabled);
    const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
    const conflictSummary = [
        verificationEnabled ? 'Verification system is enabled' : null,
        autoRoleConfigured ? 'AutoRole is configured' : null
    ].filter(Boolean).join('\n');
    
    if (!guildConfig.verification?.autoVerify?.enabled) {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [infoEmbed(
                "Auto-Verification Status",
                `🔴 **Status:** Disabled\n\nAuto-verification is currently disabled.\n\nUse \`/autoverify setup\` to configure it.${conflictSummary ? `\n\n⚠️ **Setup Blockers:**\n${conflictSummary}` : ''}`
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    const autoVerify = guildConfig.verification.autoVerify;
    const autoVerifyRole = autoVerify.roleId ? guild.roles.cache.get(autoVerify.roleId) : null;
    let criteriaDescription = "";

    switch (autoVerify.criteria) {
        case "account_age":
            criteriaDescription = `Accounts older than ${autoVerify.accountAgeDays} days`;
            break;
        case "server_size":
            criteriaDescription = `All users (server has less than ${serverSizeThreshold} members)`;
            break;
        case "none":
            criteriaDescription = "All users immediately";
            break;
    }

    const statusEmbed = createEmbed({
        title: "🤖 Auto-Verification Status",
        description: "Current auto-verification configuration:",
        color: getColor('success')
    })
    .addFields(
        { name: "📊 Status", value: "✅ Enabled", inline: true },
        { name: "🏷️ Target Role", value: autoVerifyRole ? autoVerifyRole.toString() : "Not found", inline: true },
        { name: "🎯 Criteria", value: criteriaDescription, inline: true },
        { 
            name: "📅 Account Age Requirement", 
            value: autoVerify.accountAgeDays ? `${autoVerify.accountAgeDays} days` : "N/A",
            inline: true 
        },
        {
            name: "⚠️ Setup Conflicts",
            value: conflictSummary || "None",
            inline: false
        }
    );

    await InteractionHelper.safeReply(interaction, {
        embeds: [statusEmbed],
        flags: MessageFlags.Ephemeral
    });
}




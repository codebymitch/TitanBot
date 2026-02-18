import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { validateAutoVerifyCriteria } from '../../../services/verificationService.js';
import { logger } from '../../../utils/logger.js';

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
                .setName("enable")
                .setDescription("Enable automatic verification")
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
        return withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            switch (subcommand) {
                case "enable":
                    return await handleEnable(interaction, guild, client);
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
    }
};

async function handleEnable(interaction, guild, client) {
    const criteria = interaction.options.getString("criteria");
    const accountAgeDays = interaction.options.getInteger("account_age_days") || defaultAccountAgeDays;

    await interaction.deferReply();

    try {
        
        validateAutoVerifyCriteria(criteria, criteria === 'account_age' ? accountAgeDays : 1);

        const guildConfig = await getGuildConfig(client, guild.id);
        
        if (!guildConfig.verification) {
            guildConfig.verification = {};
        }

        guildConfig.verification.autoVerify = {
            enabled: true,
            criteria: criteria,
            accountAgeDays: criteria === "account_age" ? accountAgeDays : null
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
            accountAgeDays: criteria === 'account_age' ? accountAgeDays : null
        });

        await interaction.editReply({
            embeds: [successEmbed(
                "Auto-Verification Enabled",
                `Automatic verification has been enabled!\n\n**Criteria:** ${criteriaDescription}\n\nUsers who meet these criteria will be automatically verified when they join the server.`
            )]
        });

    } catch (error) {
        
        throw error;
    }
}

async function handleDisable(interaction, guild, client) {
    await interaction.deferReply();

    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.autoVerify?.enabled) {
        return await interaction.editReply({
            embeds: [infoEmbed("Already Disabled", "Auto-verification is already disabled.")],
        });
    }

    guildConfig.verification.autoVerify.enabled = false;
    await setGuildConfig(client, guild.id, guildConfig);

    logger.info('Auto-verify disabled', { guildId: guild.id });

    await interaction.editReply({
        embeds: [successEmbed(
            "Auto-Verification Disabled",
            "Automatic verification has been disabled. Users will now need to verify manually."
        )]
    });
}

async function handleStatus(interaction, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.autoVerify?.enabled) {
        return await interaction.reply({
            embeds: [infoEmbed(
                "Auto-Verification Status",
                "🔴 **Status:** Disabled\n\nAuto-verification is currently disabled. Users must verify manually.\n\nUse `/autoverify enable` to enable it."
            )],
            flags: MessageFlags.Ephemeral
        });
    }

    const autoVerify = guildConfig.verification.autoVerify;
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
        { name: "🎯 Criteria", value: criteriaDescription, inline: true },
        { 
            name: "📅 Account Age Requirement", 
            value: autoVerify.accountAgeDays ? `${autoVerify.accountAgeDays} days` : "N/A",
            inline: true 
        }
    );

    await interaction.reply({
        embeds: [statusEmbed],
        flags: MessageFlags.Ephemeral
    });
}




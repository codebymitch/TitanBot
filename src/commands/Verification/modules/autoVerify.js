import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';

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
                            { name: "Account Age (older than 7 days)", value: "account_age" },
                            { name: "Server Members (less than 1000 members)", value: "server_size" },
                            { name: "No Criteria (verify everyone)", value: "none" }
                        )
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("account_age_days")
                        .setDescription("Minimum account age in days (for account age criteria)")
                        .setMinValue(1)
                        .setMaxValue(365)
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
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        try {
            switch (subcommand) {
                case "enable":
                    return await handleEnable(interaction, guild, client);
                case "disable":
                    return await handleDisable(interaction, guild, client);
                case "status":
                    return await handleStatus(interaction, guild, client);
                default:
                    return await interaction.reply({
                        embeds: [errorEmbed("Invalid Subcommand", "Please select a valid subcommand.")],
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error("AutoVerify command error:", error);
            return await interaction.reply({
                embeds: [errorEmbed("System Error", "An error occurred while processing your request.")],
                ephemeral: true
            });
        }
    }
};

async function handleEnable(interaction, guild, client) {
    const criteria = interaction.options.getString("criteria");
    const accountAgeDays = interaction.options.getInteger("account_age_days") || 7;

    await interaction.deferReply();

    try {
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
                criteriaDescription = "All users (server has less than 1000 members)";
                break;
            case "none":
                criteriaDescription = "All users immediately";
                break;
        }

        await interaction.editReply({
            embeds: [successEmbed(
                "Auto-Verification Enabled",
                `Automatic verification has been enabled!\n\n**Criteria:** ${criteriaDescription}\n\nUsers who meet these criteria will be automatically verified when they join the server.`
            )]
        });

    } catch (error) {
        console.error("Auto-verification enable error:", error);
        await interaction.editReply({
            embeds: [errorEmbed("Failed to Enable", "Could not enable auto-verification. Please try again.")],
        });
    }
}

async function handleDisable(interaction, guild, client) {
    await interaction.deferReply();

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        
        if (!guildConfig.verification?.autoVerify?.enabled) {
            return await interaction.editReply({
                embeds: [infoEmbed("Already Disabled", "Auto-verification is already disabled.")],
            });
        }

        guildConfig.verification.autoVerify.enabled = false;
        await setGuildConfig(client, guild.id, guildConfig);

        await interaction.editReply({
            embeds: [successEmbed(
                "Auto-Verification Disabled",
                "Automatic verification has been disabled. Users will now need to verify manually."
            )]
        });

    } catch (error) {
        console.error("Auto-verification disable error:", error);
        await interaction.editReply({
            embeds: [errorEmbed("Failed to Disable", "Could not disable auto-verification. Please try again.")],
        });
    }
}

async function handleStatus(interaction, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    
    if (!guildConfig.verification?.autoVerify?.enabled) {
        return await interaction.reply({
            embeds: [infoEmbed(
                "Auto-Verification Status",
                "🔴 **Status:** Disabled\n\nAuto-verification is currently disabled. Users must verify manually.\n\nUse `/autoverify enable` to enable it."
            )],
            ephemeral: true
        });
    }

    const autoVerify = guildConfig.verification.autoVerify;
    let criteriaDescription = "";

    switch (autoVerify.criteria) {
        case "account_age":
            criteriaDescription = `Accounts older than ${autoVerify.accountAgeDays} days`;
            break;
        case "server_size":
            criteriaDescription = "All users (server has less than 1000 members)";
            break;
        case "none":
            criteriaDescription = "All users immediately";
            break;
    }

    const statusEmbed = createEmbed({
        title: "🤖 Auto-Verification Status",
        description: "Current auto-verification configuration:",
        color: "#00FF00"
    })
    .addFields(
        {
            name: "📊 Status",
            value: "✅ Enabled",
            inline: true
        },
        {
            name: "🎯 Criteria",
            value: criteriaDescription,
            inline: true
        },
        {
            name: "📅 Account Age Requirement",
            value: autoVerify.accountAgeDays ? `${autoVerify.accountAgeDays} days` : "N/A",
            inline: true
        }
    );

    await interaction.reply({
        embeds: [statusEmbed],
        ephemeral: true
    });
}

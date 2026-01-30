import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getLevelingConfig, getWelcomeConfig, getApplicationSettings, getModlogSettings } from '../../utils/database.js';

// Migrated from: commands/Config/logstatus.js
export default {
    data: new SlashCommandBuilder()
        .setName("logstatus")
        .setDescription(
            "Displays the current command and logging configuration for this server.",
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    category: "config",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        if (
            !interaction.member.permissions.has(
                PermissionsBitField.Flags.ManageGuild,
            )
        ) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need Manage Server permissions.",
                    ),
                ],
            });
        }

        const currentConfig = await getGuildConfig(client, interaction.guildId);

        // Helper function to determine channel/role status
        const getStatus = (id, type) => {
            let status = "❌ Not Set";
            if (id) {
                const item =
                    type === "role"
                        ? interaction.guild.roles.cache.get(id)
                        : interaction.guild.channels.cache.get(id);

                status = item ? item.toString() : `⚠️ ID: ${id} (Missing)`;
            }
            return status;
        };

        // --- Configuration Statuses ---
        const logChannelStatus = getStatus(
            currentConfig.logChannelId,
            "channel",
        );
        const reportChannelStatus = getStatus(
            currentConfig.reportChannelId,
            "channel",
        );
        // --- ADDED PREMIUM ROLE STATUS ---
        const premiumRoleStatus = getStatus(
            currentConfig.premiumRoleId,
            "role",
        );

        // --- TOGGLEABLE SYSTEMS STATUS ---
        const levelingConfig = await getLevelingConfig(client, interaction.guildId);
        const levelingStatus = levelingConfig?.enabled ? "✅ **Enabled**" : "❌ **Disabled**";
        
        const welcomeConfig = await getWelcomeConfig(client, interaction.guildId);
        const welcomeStatus = welcomeConfig?.enabled ? "✅ **Enabled**" : "❌ **Disabled**";
        const goodbyeStatus = welcomeConfig?.goodbyeEnabled ? "✅ **Enabled**" : "❌ **Disabled**";
        
        const autoRoleStatus = getStatus(currentConfig.autoRole, "role");
        
        // Check birthday system status
        const birthdayStatus = currentConfig.birthdayChannelId ? 
            "✅ **Enabled**" : "❌ **Disabled**";

        // Enhanced moderation logging status
        const moderationLoggingStatus = currentConfig.enableLogging && currentConfig.logChannelId 
            ? "✅ **Enabled**" : "❌ **Disabled**";

        // Additional systems
        const applicationConfig = await getApplicationSettings(client, interaction.guildId);
        const applicationStatus = applicationConfig?.enabled ? "✅ **Enabled**" : "❌ **Disabled**";

        // --- LOG IGNORE FILTERS STATUS ---
        const ignoredUsers = currentConfig.logIgnore?.users || [];
        const ignoredChannels = currentConfig.logIgnore?.channels || [];

        // Format lists for display
        const formatIdList = (list) => {
            if (list.length === 0) return "None";
            if (list.length > 5)
                return `${list.length} IDs (see console for full list)`;
            return list.map((id) => `\`${id}\``).join("\n");
        };

        const statusEmbed = new EmbedBuilder()
            .setTitle("⚙️ Server Configuration Status")
            .setDescription(
                `Current settings fetched for **${interaction.guild.name}**.`,
            )
            .setColor("#3498DB")
            .setTimestamp()
            .addFields(
                // 🎮 Core Systems Section
                {
                    name: "🎮 Leveling System",
                    value: levelingStatus,
                    inline: true,
                },
                {
                    name: "🎂 Birthday System",
                    value: birthdayStatus,
                    inline: true,
                },
                {
                    name: "👋 Welcome System",
                    value: welcomeStatus,
                    inline: true,
                },
                {
                    name: "👋 Goodbye System",
                    value: goodbyeStatus,
                    inline: true,
                },
                {
                    name: "🤖 Auto Role",
                    value: autoRoleStatus,
                    inline: true,
                },
                {
                    name: "� Applications",
                    value: applicationStatus,
                    inline: true,
                },
                {
                    name: "🔨 Enhanced Moderation Logging",
                    value: moderationLoggingStatus,
                    inline: true,
                },
                {
                    name: "� Premium Role",
                    value: premiumRoleStatus,
                    inline: true,
                },
                // 📊 Configuration Channels Section
                {
                    name: "📊 Configuration Channels",
                    value: "**Audit Logs:** " + logChannelStatus + "\n**Report Logs:** " + reportChannelStatus,
                    inline: false,
                },
                // ❌ Filter Settings Section
                {
                    name: "❌ Log Filters",
                    value: "**Users:** " + formatIdList(ignoredUsers) + "\n**Channels:** " + formatIdList(ignoredChannels),
                    inline: false,
                },
            );

        await interaction.editReply({ embeds: [statusEmbed] });
    },
};

import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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

        // --- Disabled Commands Status ---
        const disabledCommands = currentConfig.enabledCommands || {};
        const disabledList = Object.entries(disabledCommands)
            .filter(([name, enabled]) => enabled === false)
            .map(([name]) => `\`/${name}\``);

        const disabledCommandsStatus =
            disabledList.length > 0 ? disabledList.join(", ") : "✅ None";

        // --- Log Ignore Filters Status ---
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
                // Configuration Section
                {
                    name: "📝 Audit Log Channel",
                    value: logChannelStatus,
                    inline: true,
                },
                {
                    name: "🚨 Report Log Channel",
                    value: reportChannelStatus,
                    inline: true,
                },
                {
                    // --- NEW FIELD ADDED ---
                    name: "👑 Premium Shop Role",
                    value: premiumRoleStatus,
                    inline: true,
                },
                {
                    name: "🚫 Disabled Commands",
                    value: disabledCommandsStatus,
                    inline: false,
                },
                // Ignore Filters Section
                {
                    name: "❌ Ignored Users (Log Filter)",
                    value: formatIdList(ignoredUsers),
                    inline: true,
                },
                {
                    name: "❌ Ignored Channels (Log Filter)",
                    value: formatIdList(ignoredChannels),
                    inline: true,
                },
            );

        await interaction.editReply({ embeds: [statusEmbed] });
    },
};

import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getLevelingConfig, getWelcomeConfig, getApplicationSettings, getModlogSettings } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Permission Denied",
                            "You need Manage Server permissions.",
                        ),
                    ],
                });
            }

            await interaction.deferReply();

            const currentConfig = await getGuildConfig(client, interaction.guildId);

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

            const logChannelStatus = getStatus(
                currentConfig.logChannelId,
                "channel",
            );
            const reportChannelStatus = getStatus(
                currentConfig.reportChannelId,
                "channel",
            );
            const premiumRoleStatus = getStatus(
                currentConfig.premiumRoleId,
                "role",
            );

            const levelingConfig = await getLevelingConfig(client, interaction.guildId);
            const levelingStatus = levelingConfig?.enabled ? "✅ **Enabled**" : "❌ **Disabled**";
            
            const welcomeConfig = await getWelcomeConfig(client, interaction.guildId);
            const welcomeStatus = welcomeConfig?.enabled ? "✅ **Enabled**" : "❌ **Disabled**";
            const goodbyeStatus = welcomeConfig?.goodbyeEnabled ? "✅ **Enabled**" : "❌ **Disabled**";
            
            const autoRoleStatus = getStatus(currentConfig.autoRole, "role");
            
            const birthdayStatus = currentConfig.birthdayChannelId ? 
                "✅ **Enabled**" : "❌ **Disabled**";

            const moderationLoggingStatus = currentConfig.enableLogging && currentConfig.logChannelId 
                ? "✅ **Enabled**" : "❌ **Disabled**";

            const applicationConfig = await getApplicationSettings(client, interaction.guildId);
            const applicationStatus = applicationConfig?.enabled ? "✅ **Enabled**" : "❌ **Disabled**";

            const maxTicketsPerUser = currentConfig.maxTicketsPerUser || 3;
            const dmOnClose = currentConfig.dmOnClose !== false;
            
            const ticketLogging = currentConfig.ticketLogging || {};
            const lifecycleChannelStatus = getStatus(ticketLogging.lifecycleChannelId, "channel");
            const transcriptChannelStatus = getStatus(ticketLogging.transcriptChannelId, "channel");
            
            let totalOpenTickets = 0;
            try {
                const { getFromDb } = await import('../../../utils/database.js');
                const ticketKeys = await getFromDb(`guild:${interaction.guildId}:ticket:*`, {});
                for (const key of Object.keys(ticketKeys)) {
                    const ticketData = await getFromDb(key, null);
                    if (ticketData && ticketData.status === 'open') totalOpenTickets++;
                }
            } catch (e) {
                console.error('Error counting tickets:', e);
            }
            
            const ticketLoggingStatus = ticketLogging.lifecycleChannelId || ticketLogging.transcriptChannelId 
                ? "✅ **Enabled**" : "❌ **Disabled**";
                
            const ticketLimitsStatus = `🎫 **${maxTicketsPerUser}** per user\n📩 DM on Close: ${dmOnClose ? '✅' : '❌'}\n📊 Open Tickets: ${totalOpenTickets}\n📝 Ticket Logging: ${ticketLoggingStatus}`;

            const ignoredUsers = currentConfig.logIgnore?.users || [];
            const ignoredChannels = currentConfig.logIgnore?.channels || [];

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
                        name: "📋 Applications",
                        value: applicationStatus,
                        inline: true,
                    },
                    {
                        name: "🔨 Enhanced Moderation Logging",
                        value: moderationLoggingStatus,
                        inline: true,
                    },
                    {
                        name: "💎 Premium Role",
                        value: premiumRoleStatus,
                        inline: true,
                    },
                    {
                        name: "🎫 Ticket Limits",
                        value: ticketLimitsStatus,
                        inline: true,
                    },
                    {
                        name: "📊 Configuration Channels",
                        value: "**Audit Logs:** " + logChannelStatus + 
                               "\n**Report Logs:** " + reportChannelStatus +
                               "\n**Ticket Lifecycle:** " + lifecycleChannelStatus +
                               "\n**Ticket Transcripts:** " + transcriptChannelStatus,
                        inline: false,
                    },
                    {
                        name: "❌ Log Filters",
                        value: "**Users:** " + formatIdList(ignoredUsers) + "\n**Channels:** " + formatIdList(ignoredChannels),
                        inline: false,
                    },
                );

            await interaction.editReply({ embeds: [statusEmbed] });
        } catch (error) {
            console.error("config_logging_status error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Configuration Error",
                        "Failed to fetch or display the configuration status.",
                    ),
                ],
            });
        }
    }
};

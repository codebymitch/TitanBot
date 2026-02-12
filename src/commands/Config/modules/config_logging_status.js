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
                let status = "âŒ Not Set";
                if (id) {
                    const item =
                        type === "role"
                            ? interaction.guild.roles.cache.get(id)
                            : interaction.guild.channels.cache.get(id);

                    status = item ? item.toString() : `âš ï¸ ID: ${id} (Missing)`;
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
            const levelingStatus = levelingConfig?.enabled ? "âœ… **Enabled**" : "âŒ **Disabled**";
            
            const welcomeConfig = await getWelcomeConfig(client, interaction.guildId);
            const welcomeStatus = welcomeConfig?.enabled ? "âœ… **Enabled**" : "âŒ **Disabled**";
            const goodbyeStatus = welcomeConfig?.goodbyeEnabled ? "âœ… **Enabled**" : "âŒ **Disabled**";
            
            const autoRoleStatus = getStatus(currentConfig.autoRole, "role");
            
            const birthdayStatus = currentConfig.birthdayChannelId ? 
                "âœ… **Enabled**" : "âŒ **Disabled**";

            const moderationLoggingStatus = currentConfig.enableLogging && currentConfig.logChannelId 
                ? "âœ… **Enabled**" : "âŒ **Disabled**";

            const applicationConfig = await getApplicationSettings(client, interaction.guildId);
            const applicationStatus = applicationConfig?.enabled ? "âœ… **Enabled**" : "âŒ **Disabled**";

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
                ? "âœ… **Enabled**" : "âŒ **Disabled**";
                
            const ticketLimitsStatus = `ðŸŽ« **${maxTicketsPerUser}** per user\nðŸ“© DM on Close: ${dmOnClose ? 'âœ…' : 'âŒ'}\nðŸ“Š Open Tickets: ${totalOpenTickets}\nðŸ“ Ticket Logging: ${ticketLoggingStatus}`;

            const ignoredUsers = currentConfig.logIgnore?.users || [];
            const ignoredChannels = currentConfig.logIgnore?.channels || [];

            const formatIdList = (list) => {
                if (list.length === 0) return "None";
                if (list.length > 5)
                    return `${list.length} IDs (see console for full list)`;
                return list.map((id) => `\`${id}\``).join("\n");
            };

            const statusEmbed = new EmbedBuilder()
                .setTitle("âš™ï¸ Server Configuration Status")
                .setDescription(
                    `Current settings fetched for **${interaction.guild.name}**.`,
                )
                .setColor("#3498DB")
                .setTimestamp()
                .addFields(
                    {
                        name: "ðŸŽ® Leveling System",
                        value: levelingStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸŽ‚ Birthday System",
                        value: birthdayStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸ‘‹ Welcome System",
                        value: welcomeStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸ‘‹ Goodbye System",
                        value: goodbyeStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸ¤– Auto Role",
                        value: autoRoleStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸ“‹ Applications",
                        value: applicationStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸ”¨ Enhanced Moderation Logging",
                        value: moderationLoggingStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸ’Ž Premium Role",
                        value: premiumRoleStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸŽ« Ticket Limits",
                        value: ticketLimitsStatus,
                        inline: true,
                    },
                    {
                        name: "ðŸ“Š Configuration Channels",
                        value: "**Audit Logs:** " + logChannelStatus + 
                               "\n**Report Logs:** " + reportChannelStatus +
                               "\n**Ticket Lifecycle:** " + lifecycleChannelStatus +
                               "\n**Ticket Transcripts:** " + transcriptChannelStatus,
                        inline: false,
                    },
                    {
                        name: "âŒ Log Filters",
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


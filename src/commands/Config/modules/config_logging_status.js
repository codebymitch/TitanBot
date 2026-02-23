import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getLoggingStatus } from '../../../services/loggingService.js';
import { getLevelingConfig, getWelcomeConfig, getApplicationSettings, getModlogSettings } from '../../../utils/database.js';
import { createStatusIndicatorButtons } from '../../../utils/loggingUi.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        try {
if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Permission Denied",
                            "You need Manage Server permissions.",
                        ),
                    ],
                });
            }

            await InteractionHelper.safeDefer(interaction);

            const currentConfig = await getGuildConfig(client, interaction.guildId);
            const loggingStatus = await getLoggingStatus(client, interaction.guildId);

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
                loggingStatus.channelId || currentConfig.logChannelId,
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

            const aggregateLoggingStatus = loggingStatus.enabled && (loggingStatus.channelId || currentConfig.logChannelId)
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

            
            let eventStatus = '';
            const categories = {
                'moderation': '🔨 Moderation',
                'ticket': '🎫 Tickets',
                'message': '❌ Messages',
                'role': '🏷️ Roles',
                'member': '👋 Join/Leave',
                'leveling': '📈 Leveling',
                'reactionrole': '🎭 Reaction Roles',
                'giveaway': '🎁 Giveaway',
                'counter': '📊 Counter'
            };

            for (const [category, display] of Object.entries(categories)) {
                const categoryEntries = Object.entries(loggingStatus.enabledEvents)
                    .filter(([key]) => key.startsWith(category));
                const isEnabled = categoryEntries.length === 0
                    ? true
                    : categoryEntries.some(([, value]) => value !== false);
                
                eventStatus += `${isEnabled ? '✅' : '❌'} ${display}\n`;
            }

            const statusEmbed = new EmbedBuilder()
                .setTitle("⚙️ Server Configuration Status")
                .setDescription(
                    `Current settings fetched for **${interaction.guild.name}**.`,
                )
                .setColor(getColor('info'))
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
                        name: "📊 Unified Logging System",
                        value: aggregateLoggingStatus,
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
                        name: "📋 Event Logging Status",
                        value: eventStatus,
                        inline: false,
                    },
                    {
                        name: "❌ Log Filters",
                        value: "**Users:** " + formatIdList(ignoredUsers) + "\n**Channels:** " + formatIdList(ignoredChannels),
                        inline: false,
                    },
                );

            
            const statusButtons = createStatusIndicatorButtons(loggingStatus.enabledEvents);
            const refreshButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('logging_toggle:all')
                    .setLabel('Toggle All')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('logging_refresh_status')
                    .setLabel('🔄 Refresh Status')
                    .setStyle(ButtonStyle.Primary)
            );

            
            const components = [...statusButtons, refreshButton];

            await InteractionHelper.safeEditReply(interaction, { 
                embeds: [statusEmbed],
                components
            });
        } catch (error) {
            console.error("config_logging_status error:", error);
            await InteractionHelper.safeEditReply(interaction, {
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






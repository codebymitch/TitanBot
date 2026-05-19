import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getLoggingStatus, EVENT_TYPES } from '../../../services/loggingService.js';
import { createLoggingDashboardComponents } from '../../../utils/loggingUi.js';
import { errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce((acc, eventType) => {
    const [category] = eventType.split('.');
    if (!acc[category]) acc[category] = [];
    acc[category].push(eventType);
    return acc;
}, {});

const CATEGORY_MAP = [
    ['moderation',   '🔨 Moderation'],
    ['ticket',       '🎫 Ticket Events'],
    ['message',      '✉️ Message Events'],
    ['role',         '🏷️ Role Events'],
    ['member',       '👥 Member Events'],
    ['leveling',     '📈 Leveling Events'],
    ['reactionrole', '🎭 Reaction Role Events'],
    ['giveaway',     '🎁 Giveaway Events'],
    ['counter',      '📊 Counter Events'],
    ['channel',      '📁 Channel Events'],
    ['thread',       '🧵 Thread Events'],
    ['emoji',        '😀 Emoji Events'],
    ['sticker',      '🏷️ Sticker Events'],
    ['server',       '⚙️ Server Events'],
    ['invite',       '🔗 Invite Events'],
    ['webhook',      '🪝 Webhook Events'],
    ['event',        '📅 Scheduled Events'],
    ['integration',  '🧩 Integration Events'],
];

function getCategoryStatus(enabledEvents, category, auditEnabled) {
    if (!auditEnabled) return false;
    const events = enabledEvents || {};
    if (events[`${category}.*`] === false) return false;
    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    if (categoryEvents.length === 0) return true;
    return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id) {
    if (!id) return '`Not configured`';
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ Missing (${id})`;
}

export async function buildLoggingDashboardView(interaction, client) {
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const loggingStatus = await getLoggingStatus(client, interaction.guildId);

    const auditEnabled = Boolean(loggingStatus.enabled);
    const auditChannel = await formatChannelMention(
        interaction.guild,
        loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId,
    );
    const lifecycleChannel = await formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId);
    const transcriptChannel = await formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId);

    const ignoredUsers = guildConfig.logIgnore?.users || [];
    const ignoredChannels = guildConfig.logIgnore?.channels || [];

    const categoryLines = CATEGORY_MAP.map(([key, label]) => {
        const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
        return `${on ? '✅' : '❌'} ${label}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('📋 Logging Dashboard')
        .setDescription(`Manage audit logging for **${interaction.guild.name}**. Category buttons toggle logging instantly.`)
        .setColor(auditEnabled ? getColor('success') : getColor('warning'))
        .addFields(
            {
                name: '🧾 Audit Logging',
                value: auditEnabled ? '✅ Enabled' : '❌ Disabled',
                inline: true,
            },
            {
                name: '\u200B',
                value: '\u200B',
                inline: true,
            },
            {
                name: '\u200B',
                value: '\u200B',
                inline: true,
            },
            {
                name: '📡 Log Channels',
                value: [
                    `**Audit:** ${auditChannel}`,
                    `**Ticket Logs:** ${lifecycleChannel}`,
                    `**Ticket Transcripts:** ${transcriptChannel}`,
                ].join('\n'),
                inline: false,
            },
            {
                name: '📋 Event Categories',
                value: categoryLines,
                inline: false,
            },
            {
                name: '🧹 Ignore Filters',
                value: `Users: **${ignoredUsers.length}**\nChannels: **${ignoredChannels.length}**`,
                inline: true,
            },
            {
                name: '🕒 Last Refresh',
                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true,
            },
        )
        .setFooter({ text: 'Use /logging setchannel to configure the audit channel  •  /ticket setup or /ticket dashboard to configure ticket channels' })
        .setTimestamp();

    const components = createLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled);
    return { embed, components };
}

export default {
    async execute(interaction, config, client) {
        try {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Permission Denied', 'You need **Manage Server** permissions to view the logging dashboard.')],
                });
            }

            await InteractionHelper.safeDefer(interaction);
            const { embed, components } = await buildLoggingDashboardView(interaction, client);
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });
        } catch (error) {
            logger.error('logging_dashboard error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Dashboard Error', 'Failed to load the logging dashboard.')],
            });
        }
    },
};

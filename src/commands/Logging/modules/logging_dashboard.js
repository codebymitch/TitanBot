import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getLoggingStatus, EVENT_TYPES } from '../../../services/loggingService.js';
import { createLoggingDashboardComponents } from '../../../utils/loggingUi.js';
import { errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { t } from '../../../services/i18n.js';

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce((acc, eventType) => {
    const [category] = eventType.split('.');
    if (!acc[category]) acc[category] = [];
    acc[category].push(eventType);
    return acc;
}, {});

const CATEGORY_KEYS = [
    ['moderation',   'moderation'],
    ['ticket',       'ticket'],
    ['message',      'message'],
    ['role',         'role'],
    ['member',       'member'],
    ['leveling',     'leveling'],
    ['reactionrole', 'reactionrole'],
    ['giveaway',     'giveaway'],
    ['counter',      'counter'],
    ['channel',      'channel'],
    ['thread',       'thread'],
    ['emoji',        'emoji'],
    ['sticker',      'sticker'],
    ['server',       'server'],
    ['invite',       'invite'],
    ['webhook',      'webhook'],
    ['event',        'event'],
    ['integration',  'integration'],
];

function getCategoryStatus(enabledEvents, category, auditEnabled) {
    if (!auditEnabled) return false;
    const events = enabledEvents || {};
    if (events[`${category}.*`] === false) return false;
    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    if (categoryEvents.length === 0) return true;
    return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id, notConfiguredLabel) {
    if (!id) return notConfiguredLabel;
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ Missing (${id})`;
}

export async function buildLoggingDashboardView(interaction, client, lang) {
    // lang is optional (for backward compat from loggingButtons which calls without it)
    const resolvedLang = lang || 'es';
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const loggingStatus = await getLoggingStatus(client, interaction.guildId);

    const auditEnabled = Boolean(loggingStatus.enabled);
    const notConfigured = t(resolvedLang, 'wolf.cmd.logging.dashboard.notConfigured');
    const auditChannel = await formatChannelMention(
        interaction.guild,
        loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId,
        notConfigured
    );
    const lifecycleChannel = await formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId, notConfigured);
    const transcriptChannel = await formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId, notConfigured);

    const ignoredUsers = guildConfig.logIgnore?.users || [];
    const ignoredChannels = guildConfig.logIgnore?.channels || [];

    const categoryLines = CATEGORY_KEYS.map(([key]) => {
        const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
        const label = t(resolvedLang, `wolf.cmd.logging.dashboard.categories.${key}`);
        return `${on ? '✅' : '❌'} ${label}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(t(resolvedLang, 'wolf.cmd.logging.dashboard.embedTitle'))
        .setDescription(t(resolvedLang, 'wolf.cmd.logging.dashboard.embedDesc', { guild: interaction.guild.name }))
        .setColor(auditEnabled ? getColor('success') : getColor('warning'))
        .addFields(
            {
                name: t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldAuditTitle'),
                value: auditEnabled
                    ? t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldAuditEnabled')
                    : t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldAuditDisabled'),
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
                name: t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldChannelsTitle'),
                value: t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldChannelsValue', {
                    audit: auditChannel,
                    ticketLogs: lifecycleChannel,
                    transcripts: transcriptChannel,
                }),
                inline: false,
            },
            {
                name: t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldCategoriesTitle'),
                value: categoryLines,
                inline: false,
            },
            {
                name: t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldIgnoreTitle'),
                value: t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldIgnoreValue', {
                    users: ignoredUsers.length,
                    channels: ignoredChannels.length,
                }),
                inline: true,
            },
            {
                name: t(resolvedLang, 'wolf.cmd.logging.dashboard.fieldRefreshTitle'),
                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true,
            },
        )
        .setFooter({ text: t(resolvedLang, 'wolf.cmd.logging.dashboard.footerText') })
        .setTimestamp();

    const components = createLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled, resolvedLang);
    return { embed, components };
}

export default {
    async execute(interaction, config, client, lang) {
        try {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed(
                        t(lang, 'wolf.cmd.logging.dashboard.permDeniedTitle'),
                        t(lang, 'wolf.cmd.logging.dashboard.permDeniedDesc')
                    )],
                });
            }

            await InteractionHelper.safeDefer(interaction);
            const { embed, components } = await buildLoggingDashboardView(interaction, client, lang);
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });
        } catch (error) {
            logger.error('logging_dashboard error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    t(lang || 'es', 'wolf.cmd.logging.dashboard.errLoadTitle'),
                    t(lang || 'es', 'wolf.cmd.logging.dashboard.errLoadDesc')
                )],
            });
        }
    },
};

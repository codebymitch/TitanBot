import { getColor } from '../../../config/bot.js';
import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { errorEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getLoggingStatus, EVENT_TYPES } from '../../../services/loggingService.js';
import { getWelcomeConfig, getApplicationSettings } from '../../../utils/database.js';
import { createLoggingStatusComponents } from '../../../utils/loggingUi.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getConfiguration as getJoinToCreateConfiguration } from '../../../services/joinToCreateService.js';
import { getLevelingConfig } from '../../../services/leveling.js';
import { logger } from '../../../utils/logger.js';

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce((accumulator, eventType) => {
    const [category] = eventType.split('.');
    if (!accumulator[category]) {
        accumulator[category] = [];
    }
    accumulator[category].push(eventType);
    return accumulator;
}, {});

function asEnabledLabel(enabled) {
    return enabled ? '✅ Enabled' : '❌ Disabled';
}

async function formatChannelMention(guild, id) {
    if (!id) return '❌ Not Set';
    const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ Missing (${id})`;
}

function formatRoleMention(guild, id) {
    if (!id) return '❌ Not Set';
    const role = guild.roles.cache.get(id);
    return role ? role.toString() : `⚠️ Missing (${id})`;
}

function getCategoryStatus(enabledEvents, category, auditEnabled = true) {
    if (!auditEnabled) {
        return false;
    }

    const events = enabledEvents || {};
    if (events[`${category}.*`] === false) {
        return false;
    }

    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    if (categoryEvents.length === 0) {
        return true;
    }

    return categoryEvents.every((eventType) => events[eventType] !== false);
}

export async function buildLoggingStatusView(interaction, client) {
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const loggingStatus = await getLoggingStatus(client, interaction.guildId);
    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    const welcomeConfig = await getWelcomeConfig(client, interaction.guildId);
    const applicationConfig = await getApplicationSettings(client, interaction.guildId);
    const joinToCreateConfig = await getJoinToCreateConfiguration(client, interaction.guildId);

    const verificationEnabled = Boolean(guildConfig.verification?.enabled);
    const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
    const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig?.roleIds) && welcomeConfig.roleIds.length > 0);

    const auditEnabled = Boolean(loggingStatus.enabled);
    const auditChannelStatus = await formatChannelMention(
        interaction.guild,
        loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId
    );
    const reportChannelStatus = await formatChannelMention(interaction.guild, guildConfig.reportChannelId);
    const lifecycleChannelStatus = await formatChannelMention(interaction.guild, guildConfig.ticketLogging?.lifecycleChannelId);
    const transcriptChannelStatus = await formatChannelMention(interaction.guild, guildConfig.ticketLogging?.transcriptChannelId);

    const systems = [
        { name: '🧾 Audit Logging', value: asEnabledLabel(auditEnabled), inline: true },
        { name: '📈 Leveling', value: asEnabledLabel(Boolean(levelingConfig?.enabled)), inline: true },
        { name: '👋 Welcome', value: asEnabledLabel(Boolean(welcomeConfig?.enabled)), inline: true },
        { name: '👋 Goodbye', value: asEnabledLabel(Boolean(welcomeConfig?.goodbyeEnabled)), inline: true },
        { name: '🎂 Birthday', value: asEnabledLabel(Boolean(guildConfig.birthdayChannelId)), inline: true },
        { name: '📋 Applications', value: asEnabledLabel(Boolean(applicationConfig?.enabled)), inline: true },
        { name: '✅ Verification', value: asEnabledLabel(verificationEnabled), inline: true },
        { name: '🤖 AutoVerify', value: asEnabledLabel(autoVerifyEnabled), inline: true },
        { name: '🎧 Join to Create', value: asEnabledLabel(Boolean(joinToCreateConfig?.enabled)), inline: true },
        { name: '🛡️ Auto Role', value: autoRoleConfigured ? `✅ Configured (${formatRoleMention(interaction.guild, guildConfig.autoRole)})` : '❌ Disabled', inline: true }
    ];

    const categoryMap = [
        ['moderation', '🔨 Moderation'],
        ['ticket', '🎫 Ticket Events'],
        ['message', '❌ Message Events'],
        ['role', '🏷️ Role Events'],
        ['member', '👥 Member Events'],
        ['leveling', '📈 Leveling Events'],
        ['reactionrole', '🎭 Reaction Role Events'],
        ['giveaway', '🎁 Giveaway Events'],
        ['counter', '📊 Counter Events']
    ];

    const eventStatusLines = categoryMap
        .map(([key, label]) => `${getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled) ? '✅' : '❌'} ${label}`)
        .join('\n');

    const ignoredUsers = guildConfig.logIgnore?.users || [];
    const ignoredChannels = guildConfig.logIgnore?.channels || [];

    const statusEmbed = new EmbedBuilder()
        .setTitle('⚙️ Configuration Status')
        .setDescription(`Live status for **${interaction.guild.name}**. Toggle buttons update this embed instantly.`)
        .setColor(getColor('info'))
        .addFields(
            ...systems,
            {
                name: '📡 Log Destinations',
                value:
                    `Audit: ${auditChannelStatus}\n` +
                    `Reports: ${reportChannelStatus}\n` +
                    `Ticket Lifecycle: ${lifecycleChannelStatus}\n` +
                    `Ticket Transcripts: ${transcriptChannelStatus}`,
                inline: false,
            },
            {
                name: '📋 Event Categories',
                value: eventStatusLines,
                inline: false,
            },
            {
                name: '🧹 Ignore Filters',
                value: `Users: ${ignoredUsers.length}\nChannels: ${ignoredChannels.length}`,
                inline: true,
            },
            {
                name: '🕒 Last Refresh',
                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true,
            }
        )
        .setTimestamp();

    const components = createLoggingStatusComponents(loggingStatus.enabledEvents, auditEnabled);
    return { embed: statusEmbed, components };
}

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
            const { embed, components } = await buildLoggingStatusView(interaction, client);

            await InteractionHelper.safeEditReply(interaction, { 
                embeds: [embed],
                components
            });
        } catch (error) {
            logger.error("config_logging_status error:", error);
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






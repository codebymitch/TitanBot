import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
} from 'discord.js';
import { createEmbed, successEmbed, errorEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import {
    setAntiRaidEnabled,
    updateAntiRaidConfig,
    addToWhitelist,
    removeFromWhitelist,
    getAntiRaidConfig,
    getLiveStatus,
} from '../../services/antiRaid.js';

export default {
    data: new SlashCommandBuilder()
        .setName('antiraid')
        .setDescription('Manage the anti-raid protection system.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)

        // ── /antiraid enable ──────────────────────────────────────────────
        .addSubcommand((sub) =>
            sub
                .setName('enable')
                .setDescription('Enable the anti-raid protection system.')
        )

        // ── /antiraid disable ─────────────────────────────────────────────
        .addSubcommand((sub) =>
            sub
                .setName('disable')
                .setDescription('Disable the anti-raid protection system.')
        )

        // ── /antiraid status ──────────────────────────────────────────────
        .addSubcommand((sub) =>
            sub
                .setName('status')
                .setDescription('Show the current anti-raid configuration and live status.')
        )

        // ── /antiraid config ──────────────────────────────────────────────
        .addSubcommand((sub) =>
            sub
                .setName('config')
                .setDescription('Configure anti-raid thresholds, actions, and log channel.')
                .addIntegerOption((opt) =>
                    opt
                        .setName('threshold')
                        .setDescription('Number of joins that trigger a raid (default: 5).')
                        .setMinValue(2)
                        .setMaxValue(50)
                        .setRequired(false)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('time_window')
                        .setDescription('Time window in seconds to count joins (default: 10).')
                        .setMinValue(3)
                        .setMaxValue(120)
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('action')
                        .setDescription('Action to take when a raid is detected (default: alert).')
                        .setRequired(false)
                        .addChoices(
                            { name: '🔔 Alert only (no action on members)', value: 'alert' },
                            { name: '👢 Kick raiders',                       value: 'kick'  },
                            { name: '🔨 Ban raiders',                        value: 'ban'   },
                            { name: '🔇 Mute raiders (10 min timeout)',       value: 'mute'  },
                        )
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('log_channel')
                        .setDescription('Channel to send raid alerts to.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )

        // ── /antiraid whitelist ───────────────────────────────────────────
        .addSubcommandGroup((group) =>
            group
                .setName('whitelist')
                .setDescription('Manage users exempt from anti-raid checks.')
                .addSubcommand((sub) =>
                    sub
                        .setName('add')
                        .setDescription('Add a user to the anti-raid whitelist.')
                        .addUserOption((opt) =>
                            opt
                                .setName('user')
                                .setDescription('The user to whitelist.')
                                .setRequired(true)
                        )
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a user from the anti-raid whitelist.')
                        .addUserOption((opt) =>
                            opt
                                .setName('user')
                                .setDescription('The user to remove from the whitelist.')
                                .setRequired(true)
                        )
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('list')
                        .setDescription('List all whitelisted users.')
                )
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        try {
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand      = interaction.options.getSubcommand();

            // Defer for all subcommands
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) return;

            // ── Whitelist group ───────────────────────────────────────────
            if (subcommandGroup === 'whitelist') {
                return await handleWhitelist(interaction, subcommand, client);
            }

            // ── Top-level subcommands ─────────────────────────────────────
            switch (subcommand) {
                case 'enable':  return await handleEnable(interaction, client);
                case 'disable': return await handleDisable(interaction, client);
                case 'config':  return await handleConfig(interaction, client);
                case 'status':  return await handleStatus(interaction, client);
                default:
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Unknown subcommand.')],
                    });
            }
        } catch (error) {
            logger.error('antiraid command error:', error);
            await handleInteractionError(interaction, error, { command: 'antiraid' });
        }
    },
};

// ─── Subcommand handlers ──────────────────────────────────────────────────────

async function handleEnable(interaction, client) {
    const { guildId } = interaction;
    await setAntiRaidEnabled(client, guildId, true);

    return InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                'The anti-raid system is now **enabled**. Members will be monitored for suspicious join patterns.',
                '🛡️ Anti-Raid Enabled'
            ),
        ],
    });
}

async function handleDisable(interaction, client) {
    const { guildId } = interaction;
    await setAntiRaidEnabled(client, guildId, false);

    return InteractionHelper.safeEditReply(interaction, {
        embeds: [
            warningEmbed(
                'The anti-raid system has been **disabled**. No automatic protection is active.',
                '🛡️ Anti-Raid Disabled'
            ),
        ],
    });
}

async function handleConfig(interaction, client) {
    const { guildId } = interaction;

    const threshold  = interaction.options.getInteger('threshold');
    const timeWindow = interaction.options.getInteger('time_window');
    const action     = interaction.options.getString('action');
    const logChannel = interaction.options.getChannel('log_channel');

    // Build only the keys the user actually provided
    const updates = {};
    if (threshold  !== null) updates.antiRaidThreshold  = threshold;
    if (timeWindow !== null) updates.antiRaidTimeWindow  = timeWindow;
    if (action     !== null) updates.antiRaidAction      = action;
    if (logChannel !== null) updates.antiRaidLogChannel  = logChannel.id;

    if (Object.keys(updates).length === 0) {
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    'No changes were provided. Use the options to update the configuration.',
                    '⚙️ No Changes'
                ),
            ],
        });
    }

    await updateAntiRaidConfig(client, guildId, updates);

    // Build a summary of what changed
    const actionLabels = {
        kick:  '👢 Kick raiders',
        ban:   '🔨 Ban raiders',
        mute:  '🔇 Mute raiders (10 min)',
        alert: '🔔 Alert only',
    };

    const lines = [];
    if (threshold  !== null) lines.push(`**Threshold:** ${threshold} joins`);
    if (timeWindow !== null) lines.push(`**Time window:** ${timeWindow} seconds`);
    if (action     !== null) lines.push(`**Action:** ${actionLabels[action] ?? action}`);
    if (logChannel !== null) lines.push(`**Log channel:** ${logChannel}`);

    return InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                lines.join('\n'),
                '⚙️ Anti-Raid Configuration Updated'
            ),
        ],
    });
}

async function handleStatus(interaction, client) {
    const { guildId, guild } = interaction;

    const cfg  = await getAntiRaidConfig(client, guildId);
    const live = getLiveStatus(guildId);

    const actionLabels = {
        kick:  '👢 Kick raiders',
        ban:   '🔨 Ban raiders',
        mute:  '🔇 Mute raiders (10 min)',
        alert: '🔔 Alert only',
    };

    const statusEmoji = cfg.enabled ? '🟢' : '🔴';
    const raidEmoji   = live.raidActive ? '🚨' : '✅';

    const embed = new EmbedBuilder()
        .setColor(cfg.enabled ? getColor('success') : getColor('error'))
        .setTitle('🛡️ Anti-Raid Status')
        .addFields(
            {
                name: 'System Status',
                value: `${statusEmoji} ${cfg.enabled ? 'Enabled' : 'Disabled'}`,
                inline: true,
            },
            {
                name: 'Raid Active?',
                value: `${raidEmoji} ${live.raidActive ? 'YES — cooldown active' : 'No'}`,
                inline: true,
            },
            {
                name: 'Recent Joins (tracked)',
                value: `${live.recentJoins}`,
                inline: true,
            },
            {
                name: 'Threshold',
                value: `${cfg.threshold} joins`,
                inline: true,
            },
            {
                name: 'Time Window',
                value: `${cfg.timeWindow} seconds`,
                inline: true,
            },
            {
                name: 'Action',
                value: actionLabels[cfg.action] ?? cfg.action,
                inline: true,
            },
            {
                name: 'Log Channel',
                value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'Not set',
                inline: true,
            },
            {
                name: 'Whitelisted Users',
                value: cfg.whitelist.length > 0
                    ? `${cfg.whitelist.length} user(s) — use \`/antiraid whitelist list\` to view`
                    : 'None',
                inline: true,
            },
        )
        .setTimestamp()
        .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined });

    return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

async function handleWhitelist(interaction, subcommand, client) {
    const { guildId } = interaction;

    switch (subcommand) {
        case 'add': {
            const user   = interaction.options.getUser('user');
            const added  = await addToWhitelist(client, guildId, user.id);

            if (!added) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        warningEmbed(
                            `${user} is already on the anti-raid whitelist.`,
                            '⚠️ Already Whitelisted'
                        ),
                    ],
                });
            }

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `${user} (\`${user.tag}\`) has been added to the anti-raid whitelist and will not be affected by automatic actions.`,
                        '✅ User Whitelisted'
                    ),
                ],
            });
        }

        case 'remove': {
            const user    = interaction.options.getUser('user');
            const removed = await removeFromWhitelist(client, guildId, user.id);

            if (!removed) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        warningEmbed(
                            `${user} is not on the anti-raid whitelist.`,
                            '⚠️ Not Whitelisted'
                        ),
                    ],
                });
            }

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `${user} (\`${user.tag}\`) has been removed from the anti-raid whitelist.`,
                        '✅ User Removed from Whitelist'
                    ),
                ],
            });
        }

        case 'list': {
            const cfg = await getAntiRaidConfig(client, guildId);

            if (cfg.whitelist.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        infoEmbed(
                            'No users are currently whitelisted.',
                            '📋 Anti-Raid Whitelist'
                        ),
                    ],
                });
            }

            const userLines = cfg.whitelist
                .slice(0, 50)
                .map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`)
                .join('\n');

            const embed = createEmbed({
                title: '📋 Anti-Raid Whitelist',
                description: userLines,
                color: 'info',
                footer: cfg.whitelist.length > 50
                    ? `Showing 50 of ${cfg.whitelist.length} whitelisted users`
                    : `${cfg.whitelist.length} whitelisted user(s)`,
            });

            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        default:
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Unknown whitelist subcommand.')],
            });
    }
}

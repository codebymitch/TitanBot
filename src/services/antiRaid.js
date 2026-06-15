/**
 * Anti-Raid Service
 *
 * Tracks member join events in real-time and detects raid patterns.
 * When a raid is detected the configured action (kick, ban, mute, alert)
 * is executed against every member that joined within the active window.
 *
 * Configuration keys stored in guild config:
 *   antiRaidEnabled       – boolean  (default: false)
 *   antiRaidThreshold     – number   (default: 5)   joins that trigger a raid
 *   antiRaidTimeWindow    – number   (default: 10)  seconds to watch
 *   antiRaidAction        – string   (default: 'alert') kick | ban | mute | alert
 *   antiRaidWhitelist     – string[] (default: [])  user IDs exempt from checks
 *   antiRaidLogChannel    – string   (default: null) channel ID for raid alerts
 */

import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from './guildConfig.js';
import { logger } from '../utils/logger.js';
import { getColor } from '../config/bot.js';

// ─── In-memory join tracking ────────────────────────────────────────────────
// Structure: Map<guildId, { joins: Array<{ userId, timestamp }>, raidActive, cooldownUntil }>
const guildJoinTrackers = new Map();

/** How long (ms) the raid-active cooldown lasts after a raid is detected. */
const RAID_COOLDOWN_MS = 60_000; // 1 minute

/** Maximum number of join timestamps to keep per guild (memory guard). */
const MAX_JOIN_HISTORY = 200;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return (or create) the join tracker for a guild.
 * @param {string} guildId
 */
function getTracker(guildId) {
    if (!guildJoinTrackers.has(guildId)) {
        guildJoinTrackers.set(guildId, {
            joins: [],
            raidActive: false,
            cooldownUntil: 0,
        });
    }
    return guildJoinTrackers.get(guildId);
}

/**
 * Prune join timestamps that are outside the active time window.
 * @param {Array<{userId: string, timestamp: number}>} joins
 * @param {number} windowMs  Time window in milliseconds
 */
function pruneOldJoins(joins, windowMs) {
    const cutoff = Date.now() - windowMs;
    return joins.filter((j) => j.timestamp >= cutoff);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Process a new member join.  Called from the guildMemberAdd event.
 *
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<void>}
 */
export async function handleMemberJoin(member) {
    const { guild, user, client } = member;

    try {
        const config = await getGuildConfig(client, guild.id);

        // Feature disabled?
        if (!config.antiRaidEnabled) return;

        // Whitelisted user?
        const whitelist = config.antiRaidWhitelist || [];
        if (whitelist.includes(user.id) || user.bot) return;

        const threshold  = config.antiRaidThreshold  ?? 5;
        const windowSecs = config.antiRaidTimeWindow  ?? 10;
        const windowMs   = windowSecs * 1_000;
        const action     = config.antiRaidAction      ?? 'alert';
        const logChannelId = config.antiRaidLogChannel ?? null;

        const tracker = getTracker(guild.id);

        // Prune stale entries then record this join
        tracker.joins = pruneOldJoins(tracker.joins, windowMs);
        tracker.joins.push({ userId: user.id, timestamp: Date.now() });

        // Cap history size
        if (tracker.joins.length > MAX_JOIN_HISTORY) {
            tracker.joins = tracker.joins.slice(-MAX_JOIN_HISTORY);
        }

        const recentCount = tracker.joins.length;

        // ── Raid detected ────────────────────────────────────────────────────
        if (recentCount >= threshold) {
            const now = Date.now();

            // Still inside the cooldown window from a previous raid trigger?
            if (tracker.raidActive && now < tracker.cooldownUntil) {
                // Raid already being handled – just execute action on this member
                await executeAction(member, action, guild, client);
                return;
            }

            // New raid trigger
            tracker.raidActive   = true;
            tracker.cooldownUntil = now + RAID_COOLDOWN_MS;

            logger.warn(`[AntiRaid] Raid detected in guild ${guild.id} (${guild.name}) — ${recentCount} joins in ${windowSecs}s`);

            // Collect all members that joined in the window
            const raidUserIds = [...new Set(tracker.joins.map((j) => j.userId))];

            // Send alert first so staff know what's happening
            await sendRaidAlert({
                client,
                guild,
                logChannelId,
                action,
                raidUserIds,
                threshold,
                windowSecs,
            });

            // Execute the configured action on every raider
            for (const raidUserId of raidUserIds) {
                try {
                    const raidMember = await guild.members.fetch(raidUserId).catch(() => null);
                    if (raidMember) {
                        await executeAction(raidMember, action, guild, client);
                    }
                } catch (err) {
                    logger.warn(`[AntiRaid] Failed to action user ${raidUserId} in guild ${guild.id}:`, err.message);
                }
            }

            // Reset join history after acting so we don't re-trigger immediately
            tracker.joins = [];

            // Schedule cooldown reset
            setTimeout(() => {
                const t = guildJoinTrackers.get(guild.id);
                if (t) {
                    t.raidActive    = false;
                    t.cooldownUntil = 0;
                }
            }, RAID_COOLDOWN_MS);
        }
    } catch (error) {
        logger.error(`[AntiRaid] Error processing member join for guild ${guild.id}:`, error);
    }
}

/**
 * Execute the configured action against a single member.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {'kick'|'ban'|'mute'|'alert'} action
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Client} client
 */
async function executeAction(member, action, guild, client) {
    const reason = 'Anti-Raid: Automatic action — suspicious join pattern detected';

    try {
        switch (action) {
            case 'ban':
                if (member.bannable) {
                    await member.ban({ reason });
                    logger.info(`[AntiRaid] Banned ${member.user.tag} (${member.id}) in guild ${guild.id}`);
                }
                break;

            case 'kick':
                if (member.kickable) {
                    await member.kick(reason);
                    logger.info(`[AntiRaid] Kicked ${member.user.tag} (${member.id}) in guild ${guild.id}`);
                }
                break;

            case 'mute': {
                // Discord timeout – 10 minutes
                const MUTE_DURATION_MS = 10 * 60 * 1_000;
                if (member.moderatable) {
                    await member.timeout(MUTE_DURATION_MS, reason);
                    logger.info(`[AntiRaid] Muted ${member.user.tag} (${member.id}) in guild ${guild.id}`);
                }
                break;
            }

            case 'alert':
            default:
                // Alert-only: no action taken on the member
                logger.info(`[AntiRaid] Alert-only mode — no action taken on ${member.user.tag} (${member.id})`);
                break;
        }
    } catch (err) {
        logger.warn(`[AntiRaid] Could not execute action "${action}" on ${member.user.tag}:`, err.message);
    }
}

/**
 * Send a raid alert embed to the configured log channel.
 */
async function sendRaidAlert({ client, guild, logChannelId, action, raidUserIds, threshold, windowSecs }) {
    try {
        const channelId = logChannelId;
        if (!channelId) return;

        const channel = guild.channels.cache.get(channelId)
            ?? await guild.channels.fetch(channelId).catch(() => null);

        if (!channel?.isTextBased()) return;

        const botMember = guild.members.me;
        if (!botMember?.permissionsIn(channel).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return;

        const actionLabels = {
            kick:  '👢 Kicked',
            ban:   '🔨 Banned',
            mute:  '🔇 Muted (10 min)',
            alert: '🔔 Alert only (no action)',
        };

        const userList = raidUserIds
            .slice(0, 20)
            .map((id) => `<@${id}> (${id})`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setColor(getColor('error'))
            .setTitle('🚨 Raid Detected!')
            .setDescription(
                `**${raidUserIds.length}** members joined within **${windowSecs}s** (threshold: ${threshold}).\n` +
                `**Action taken:** ${actionLabels[action] ?? action}`
            )
            .addFields(
                {
                    name: `👥 Affected Users (${Math.min(raidUserIds.length, 20)} shown)`,
                    value: userList || 'None',
                    inline: false,
                },
            )
            .setTimestamp()
            .setFooter({ text: `Guild: ${guild.name}`, iconURL: guild.iconURL() ?? undefined });

        await channel.send({ embeds: [embed] });
    } catch (err) {
        logger.warn(`[AntiRaid] Failed to send raid alert in guild ${guild.id}:`, err.message);
    }
}

// ─── Config helpers (used by the /antiraid command) ──────────────────────────

/**
 * Enable or disable the anti-raid system for a guild.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {boolean} enabled
 */
export async function setAntiRaidEnabled(client, guildId, enabled) {
    await updateGuildConfig(client, guildId, { antiRaidEnabled: enabled });
}

/**
 * Update one or more anti-raid configuration values.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {Object} updates  Partial config object
 */
export async function updateAntiRaidConfig(client, guildId, updates) {
    await updateGuildConfig(client, guildId, updates);
}

/**
 * Add a user ID to the whitelist.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<boolean>} false if already whitelisted
 */
export async function addToWhitelist(client, guildId, userId) {
    const config    = await getGuildConfig(client, guildId);
    const whitelist = config.antiRaidWhitelist ?? [];
    if (whitelist.includes(userId)) return false;
    whitelist.push(userId);
    await updateGuildConfig(client, guildId, { antiRaidWhitelist: whitelist });
    return true;
}

/**
 * Remove a user ID from the whitelist.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<boolean>} false if not in whitelist
 */
export async function removeFromWhitelist(client, guildId, userId) {
    const config    = await getGuildConfig(client, guildId);
    const whitelist = config.antiRaidWhitelist ?? [];
    const idx       = whitelist.indexOf(userId);
    if (idx === -1) return false;
    whitelist.splice(idx, 1);
    await updateGuildConfig(client, guildId, { antiRaidWhitelist: whitelist });
    return true;
}

/**
 * Return the current anti-raid configuration for a guild.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @returns {Promise<Object>}
 */
export async function getAntiRaidConfig(client, guildId) {
    const config = await getGuildConfig(client, guildId);
    return {
        enabled:       config.antiRaidEnabled       ?? false,
        threshold:     config.antiRaidThreshold     ?? 5,
        timeWindow:    config.antiRaidTimeWindow     ?? 10,
        action:        config.antiRaidAction         ?? 'alert',
        whitelist:     config.antiRaidWhitelist      ?? [],
        logChannelId:  config.antiRaidLogChannel     ?? null,
    };
}

/**
 * Return the live tracker state for a guild (for status display).
 * @param {string} guildId
 */
export function getLiveStatus(guildId) {
    const tracker = guildJoinTrackers.get(guildId);
    if (!tracker) return { raidActive: false, recentJoins: 0, cooldownUntil: 0 };
    return {
        raidActive:    tracker.raidActive,
        recentJoins:   tracker.joins.length,
        cooldownUntil: tracker.cooldownUntil,
    };
}

// roleLogs.js — the `roles` room of the Logs category (auditLogChannelsService.js), in our server only:
// roles given to or taken from members, and roles created, deleted or changed, with who did it from the
// audit log. The bot's own role changes (level roles, the store, giving roles back on rejoin) are left
// out, and one audit log request is shared by every log within a second, so bursts stay light.

import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { getAuditLogChannelId, AUDIT_LOG_CATEGORY_ID } from '../auditLogChannelsService.js';
import { logger } from '../../utils/logger.js';

// The audit entry can land a moment after the gateway event; tests set this to 0.
export const ROLE_LOG_SETTINGS = { auditRetryMs: 1_500 };
const ROOM_NAME = 'roles';

const COLORS = { red: 0xe74c3c, green: 0x2ecc71, blue: 0x3498db, purple: 0x9b59b6 };
const userLine = (user, id = user?.id) => `<@${id}>${user?.tag || user?.username ? ` (${user.tag || user.username} - ${id})` : ` (${id})`}`;

function embed({ color, title, lines }) {
    return { color, title, description: lines.filter(Boolean).join('\n').slice(0, 4000), timestamp: new Date().toISOString() };
}

/** The roles room: by its name inside the Logs category, else by the ID saved in the config. */
async function findRolesRoom(guild) {
    const byName = guild.channels.cache.find?.((channel) => channel.parentId === AUDIT_LOG_CATEGORY_ID && channel.name === ROOM_NAME && channel.send);
    if (byName) return byName;
    const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
    const channelId = getAuditLogChannelId(config, ROOM_NAME);
    return channelId ? guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null) : null;
}

async function post(guild, payload) {
    const channel = await findRolesRoom(guild);
    if (!channel?.send) return false;
    return channel.send({ embeds: [payload], allowedMentions: { parse: [] } }).then(() => true).catch((error) => {
        logger.warn(`[ROLE_LOGS] Could not post: ${error.message}`);
        return false;
    });
}

// One audit log request per guild and action type is shared by every log within AUDIT_CACHE_MS, so a burst
// (the startup level role sync) doesn't flood Discord with requests and slow the bot down.
const AUDIT_CACHE_MS = 1_000;
const auditCache = new WeakMap(); // guild -> Map(type -> { at, promise })

function fetchAudit(guild, type) {
    if (!auditCache.has(guild)) auditCache.set(guild, new Map());
    const cache = auditCache.get(guild);
    const now = Date.now();
    const cached = cache.get(type);
    if (cached && now - cached.at < AUDIT_CACHE_MS) return cached.promise;
    const promise = Promise.resolve(guild.fetchAuditLogs?.({ type, limit: 10 }))
        .then((logs) => [...(logs?.entries?.values?.() || [])])
        .catch(() => []);
    cache.set(type, { at: now, promise });
    return promise;
}

/**
 * The audit entry for an action (at most 15 seconds old). With `retry` it is looked up once more after a
 * moment when not found yet (the audit log can lag behind the event).
 */
async function auditEntry(guild, type, targetId, filter = () => true, { retry = true } = {}) {
    const find = (entries) => entries.find((item) => (!targetId || item.target?.id === targetId)
        && Date.now() - (item.createdTimestamp || 0) < 15_000 && filter(item)) || null;
    const entry = find(await fetchAudit(guild, type));
    if (entry || !retry || !ROLE_LOG_SETTINGS.auditRetryMs) return entry;
    await new Promise((resolve) => setTimeout(resolve, ROLE_LOG_SETTINGS.auditRetryMs));
    return find(await fetchAudit(guild, type));
}

const byLine = (entry) => (entry?.executor ? `👮 بواسطة: ${userLine(entry.executor)}` : null);
const isBot = (guild, entry) => Boolean(entry?.executor?.id && entry.executor.id === guild.client?.user?.id);

/** Roles given to or taken from a member (not by the bot). */
export async function logMemberRoles(oldMember, newMember) {
    const guild = newMember?.guild;
    if (!guild || !isHomeGuild(guild.id) || !oldMember?.roles?.cache || oldMember.partial) return false;
    const added = [...newMember.roles.cache.values()].filter((role) => !oldMember.roles.cache.has(role.id));
    const removed = [...oldMember.roles.cache.values()].filter((role) => !newMember.roles.cache.has(role.id));
    if (!added.length && !removed.length) return false;
    const ids = new Set([...added, ...removed].map((role) => role.id));
    const entry = await auditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id,
        (item) => item.changes?.some((change) => change.new?.some?.((role) => ids.has(role.id))));
    if (isBot(guild, entry)) return false;
    return post(guild, embed({
        color: added.length && !removed.length ? COLORS.green : removed.length && !added.length ? COLORS.red : COLORS.blue,
        title: '🎭 رولات عضو اتغيرت',
        lines: [
            `👤 العضو: ${userLine(newMember.user, newMember.id)}`,
            added.length ? `➕ اتضافت: ${added.map((role) => `<@&${role.id}>`).join('، ')}` : null,
            removed.length ? `➖ اتشالت: ${removed.map((role) => `<@&${role.id}>`).join('، ')}` : null,
            byLine(entry),
        ],
    }));
}

const PERMISSION_NAMES = Object.keys(PermissionsBitField.Flags);

function permissionChanges(oldRole, newRole) {
    const before = new PermissionsBitField(oldRole.permissions?.bitfield ?? 0n);
    const after = new PermissionsBitField(newRole.permissions?.bitfield ?? 0n);
    const added = PERMISSION_NAMES.filter((name) => after.has(name, false) && !before.has(name, false));
    const removed = PERMISSION_NAMES.filter((name) => before.has(name, false) && !after.has(name, false));
    return { added, removed };
}

export async function logRoleCreate(role) {
    if (!role?.guild || !isHomeGuild(role.guild.id)) return false;
    const entry = await auditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
    if (isBot(role.guild, entry)) return false;
    return post(role.guild, embed({ color: COLORS.green, title: '🆕 رول اتعملت', lines: [`🎭 الرول: <@&${role.id}> (${role.name})`, byLine(entry)] }));
}

export async function logRoleDelete(role) {
    if (!role?.guild || !isHomeGuild(role.guild.id)) return false;
    const entry = await auditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (isBot(role.guild, entry)) return false;
    return post(role.guild, embed({ color: COLORS.red, title: '🗑️ رول اتمسحت', lines: [`🎭 الرول: **${role.name}** (${role.id})`, byLine(entry)] }));
}

export async function logRoleUpdate(oldRole, newRole) {
    if (!newRole?.guild || !isHomeGuild(newRole.guild.id)) return false;
    const lines = [];
    if (oldRole.name !== newRole.name) lines.push(`✏️ الاسم: **${oldRole.name}** ← **${newRole.name}**`);
    const colorOf = (role) => role.colors?.primaryColor ?? role.color ?? 0;
    const hex = (role) => `\`#${colorOf(role).toString(16).padStart(6, '0')}\``;
    if (colorOf(oldRole) !== colorOf(newRole)) lines.push(`🎨 اللون: ${hex(oldRole)} ← ${hex(newRole)}`);
    const { added, removed } = permissionChanges(oldRole, newRole);
    if (added.length) lines.push(`➕ صلاحيات: ${added.join('، ')}`);
    if (removed.length) lines.push(`➖ صلاحيات: ${removed.join('، ')}`);
    // Position changes alone (every role below moves too) are not logged.
    if (!lines.length) return false;
    const entry = await auditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    if (isBot(newRole.guild, entry)) return false;
    return post(newRole.guild, embed({ color: COLORS.purple, title: '🛠️ رول اتعدلت', lines: [`🎭 الرول: <@&${newRole.id}>`, ...lines, byLine(entry)] }));
}

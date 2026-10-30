// customRoleService.js — custom roles bought in the CC store (items of type 'custom_role' in
// src/config/store/ccStoreItems.js), paid every month.
//   • personal: a role only the buyer has.
//   • friends:  the buyer is the leader and invites up to `maxMembers - 1` members (`رولي انفايت @member`,
//     accepted with a button). Only the leader invites, removes, hands the lead over or cancels; the
//     others can leave (`رولي اخرج`).
// The buyer picks the name, the colour and an icon (the icon needs server boost level 2) in a form.
// The bot creates these roles (and only these; see customRoleSettings) with no permissions, just above
// the trader role, and deletes them when the subscription ends.
//
// Renewal (every `checkEveryMinutes`): a DM to the leader `remindDaysBefore` days before; on the day the
// price is taken from the leader's CC. Not enough CC → `graceDays` more days (tried again on every
// check), then the role is deleted. `رولي الغي` stops the renewal: the role stays to the end of the
// paid month, then goes.
//
// Saved per guild at `guild:<id>:customroles`: `{ <roleId>: { roleId, kind, itemId, price, name,
// leaderId, members: [userId], createdAt, paidUntil, cancelled, graceUntil, remindedFor } }`.

import { customRoleSettings, CUSTOM_ROLE_VOUCHER, voucherFor } from '../../config/store/ccStoreItems.js';
import { CC, formatCC } from '../../config/cc.js';
import { getCustomRolesKey } from '../../utils/database/keys.js';
import { Mutex } from '../../utils/mutex.js';
import { logger } from '../../utils/logger.js';
import { spendCC, grantCC, getProfile, updateCCState } from './ccService.js';
import { getTraderRole } from './traderRoleService.js';
import { isHomeGuild } from '../../config/homeGuild.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Takes (`change` -1) or gives back (+1) a free custom role month. Returns true when one was taken/given. */
export async function useVoucher(client, guildId, userId, change, voucherId = CUSTOM_ROLE_VOUCHER.id) {
    const result = await updateCCState(client, guildId, userId, (state) => {
        const held = state.inventory[voucherId] || 0;
        if (held + change < 0) return { ok: false, skipSave: true };
        if (held + change === 0) delete state.inventory[voucherId];
        else state.inventory[voucherId] = held + change;
        return { ok: true };
    });
    return Boolean(result?.ok);
}

export const COLOR_NAMES = {
    احمر: 0xe74c3c, أحمر: 0xe74c3c, ازرق: 0x3498db, أزرق: 0x3498db, اخضر: 0x2ecc71, أخضر: 0x2ecc71,
    اصفر: 0xf1c40f, أصفر: 0xf1c40f, برتقالي: 0xe67e22, بنفسجي: 0x9b59b6, موف: 0x9b59b6, وردي: 0xff6fa8,
    بمبي: 0xff6fa8, ابيض: 0xfefefe, أبيض: 0xfefefe, اسود: 0x23272a, أسود: 0x23272a, رمادي: 0x95a5a6,
    ذهبي: 0xd4af37, دهبي: 0xd4af37, فضي: 0xc0c0c0, سماوي: 0x5dade2, لبني: 0x5dade2, بني: 0x8b5a2b,
    red: 0xe74c3c, blue: 0x3498db, green: 0x2ecc71, yellow: 0xf1c40f, orange: 0xe67e22, purple: 0x9b59b6,
    pink: 0xff6fa8, white: 0xfefefe, black: 0x23272a, gray: 0x95a5a6, grey: 0x95a5a6, gold: 0xd4af37,
};
// Used when no colour is given.
const DEFAULT_COLOR = 0x5865f2;

/** `{ ok: true, color }` for `#ff0000`, `ff0000`, `احمر`... (empty = the default colour), or `{ ok: false }`. */
export function parseRoleColor(text) {
    const value = String(text || '').trim().toLowerCase();
    if (!value) return { ok: true, color: DEFAULT_COLOR };
    if (COLOR_NAMES[value] !== undefined) return { ok: true, color: COLOR_NAMES[value] };
    const hex = value.replace(/^#/u, '');
    if (/^[0-9a-f]{6}$/u.test(hex)) return { ok: true, color: parseInt(hex, 16) };
    if (/^[0-9a-f]{3}$/u.test(hex)) return { ok: true, color: parseInt(hex.split('').map((c) => c + c).join(''), 16) };
    return { ok: false };
}

const squash = (text) => String(text || '').toLowerCase().replace(/[\s_\-.・|]+/gu, '');

/**
 * Checks a custom role name. Returns `{ ok: true, name }` or `{ ok: false, reason }` with reason one of:
 * empty, too_long, link, staff_name (looks like a staff role), taken (another role has that name).
 */
export function validateRoleName(text, existingNames = [], settings = customRoleSettings) {
    const name = String(text || '').replace(/\s+/gu, ' ').trim();
    if (!name) return { ok: false, reason: 'empty' };
    if (name.length > settings.maxNameLength) return { ok: false, reason: 'too_long' };
    if (/@|https?:|discord\.gg|<[#@:]/iu.test(name)) return { ok: false, reason: 'link' };
    const squashed = squash(name);
    if (settings.blockedNameWords.some((word) => squashed.includes(squash(word)))) return { ok: false, reason: 'staff_name' };
    if (existingNames.some((existing) => squash(existing) === squashed)) return { ok: false, reason: 'taken' };
    return { ok: true, name };
}

async function loadRoles(client, guildId) {
    const raw = await client.db.get(getCustomRolesKey(guildId), {});
    return raw && typeof raw === 'object' ? raw : {};
}

async function saveRoles(client, guildId, roles) {
    const saved = await client.db.set(getCustomRolesKey(guildId), roles);
    if (saved === false) throw new Error('Failed to save the custom roles');
}

/** Runs `change(roles)` on the guild's custom roles, one change per guild at a time; saves unless it returns `skipSave`. */
async function withRoles(client, guildId, change) {
    return Mutex.runExclusive(`customroles:${guildId}`, async () => {
        const roles = await loadRoles(client, guildId);
        const result = await change(roles);
        if (!result?.skipSave) await saveRoles(client, guildId, roles);
        return result;
    });
}

export async function listCustomRoles(client, guildId) {
    return Object.values(await loadRoles(client, guildId));
}

/** The role of `kind` the member leads, or null. */
export function ledRole(records, userId, kind) {
    return records.find((record) => record.leaderId === userId && (!kind || record.kind === kind)) || null;
}

/** Every custom role the member is in (leading or not). */
export function memberRoles(records, userId) {
    return records.filter((record) => record.members.includes(userId));
}

/** Where a new custom role goes: just above the trader role (0 = leave it where Discord puts it). */
async function rolePosition(client, guild) {
    const trader = await getTraderRole(client, guild).catch(() => null);
    return trader ? trader.position + 1 : 0;
}

/** An icon only works on servers with role icons (boost level 2). */
export function canUseRoleIcons(guild) {
    return Boolean(guild?.features?.includes?.('ROLE_ICONS'));
}

/**
 * Buys a custom role: checks the name and colour, takes the first month from the buyer's CC, creates the
 * role and gives it to the buyer. Returns `{ ok: true, role, record, iconSkipped, balance }` or
 * `{ ok: false, reason }` with reason one of: has_role, bad_color, no_cc (with `balance`), create_failed,
 * or a name reason from validateRoleName.
 */
export async function buyCustomRole(client, member, item, { name, color, iconUrl = null }, { now = Date.now(), settings = customRoleSettings } = {}) {
    const { guild } = member;
    const records = await listCustomRoles(client, guild.id);
    if (ledRole(records, member.id, item.kind)) return { ok: false, reason: 'has_role' };
    const checkedName = validateRoleName(name, [...guild.roles.cache.values()].map((role) => role.name), settings);
    if (!checkedName.ok) return checkedName;
    const checkedColor = parseRoleColor(color);
    if (!checkedColor.ok) return { ok: false, reason: 'bad_color' };

    // A free month won in the luck box (report #179) pays the first month instead of CC.
    const voucherId = voucherFor(item.id)?.id;
    const voucher = Boolean(voucherId) && await useVoucher(client, guild.id, member.id, -1, voucherId);
    const paid = voucher
        ? { ok: true, balance: (await getProfile(client, guild.id, member.id)).cc, voucher: true }
        : await spendCC(client, guild.id, member.id, item.price, `custom role ${item.id}`);
    if (!paid.ok) return { ok: false, reason: 'no_cc', balance: paid.balance };
    const refund = () => (voucher
        ? useVoucher(client, guild.id, member.id, 1, voucherId)
        : grantCC(client, guild.id, member.id, item.price, { source: 'store', reason: 'custom role refund' }))
        .catch((error) => logger.error(`[CUSTOM_ROLE] Failed to refund ${member.id}`, error));

    const wantsIcon = Boolean(iconUrl) && canUseRoleIcons(guild);
    const options = {
        name: checkedName.name,
        colors: { primaryColor: checkedColor.color },
        permissions: [],
        hoist: false,
        mentionable: false,
        reason: `CC store: ${item.name} for ${member.user?.tag || member.id}`,
    };
    let role = null;
    let iconSkipped = Boolean(iconUrl) && !wantsIcon;
    try {
        role = await guild.roles.create(wantsIcon ? { ...options, icon: iconUrl } : options);
    } catch (error) {
        if (!wantsIcon) {
            logger.error(`[CUSTOM_ROLE] Could not create a role for ${member.id}`, error);
            await refund();
            return { ok: false, reason: 'create_failed' };
        }
        // A bad or too big icon: make the role without it.
        iconSkipped = true;
        role = await guild.roles.create(options).catch((retryError) => {
            logger.error(`[CUSTOM_ROLE] Could not create a role for ${member.id}`, retryError);
            return null;
        });
        if (!role) {
            await refund();
            return { ok: false, reason: 'create_failed' };
        }
    }

    const position = await rolePosition(client, guild);
    if (position) await role.setPosition(position).catch((error) => logger.warn(`[CUSTOM_ROLE] Could not move ${role.id}: ${error.message}`));
    try {
        await member.roles.add(role, `CC store: ${item.name}`);
    } catch (error) {
        logger.error(`[CUSTOM_ROLE] Could not give role ${role.id} to ${member.id}`, error);
        await role.delete('CC store: the role could not be given').catch(() => {});
        await refund();
        return { ok: false, reason: 'create_failed' };
    }

    const record = {
        roleId: role.id,
        kind: item.kind,
        itemId: item.id,
        price: item.price,
        maxMembers: item.maxMembers || 1,
        name: checkedName.name,
        leaderId: member.id,
        members: [member.id],
        createdAt: now,
        paidUntil: now + settings.days * DAY_MS,
        cancelled: false,
        graceUntil: null,
        remindedFor: null,
    };
    await withRoles(client, guild.id, (roles) => {
        roles[role.id] = record;
    });
    logger.info('[CUSTOM_ROLE] Bought', { guildId: guild.id, userId: member.id, roleId: role.id, kind: item.kind, price: item.price });
    return { ok: true, role, record, iconSkipped, balance: paid.balance, voucher: Boolean(voucher) };
}

/**
 * The leader invites `targetId` to their friends role. Returns `{ ok: true, record }` or `{ ok: false, reason }`
 * with reason one of: no_role, bot, self, already, full.
 */
export async function checkInvite(client, guild, leaderId, target) {
    const record = ledRole(await listCustomRoles(client, guild.id), leaderId, 'friends');
    if (!record) return { ok: false, reason: 'no_role' };
    if (target.bot) return { ok: false, reason: 'bot' };
    if (target.id === leaderId) return { ok: false, reason: 'self' };
    if (record.members.includes(target.id)) return { ok: false, reason: 'already' };
    if (record.members.length >= record.maxMembers) return { ok: false, reason: 'full' };
    return { ok: true, record };
}

/**
 * `member` accepts an invite to `roleId` (sent at `sentAt`). Returns `{ ok: true, record }` or
 * `{ ok: false, reason }` with reason one of: gone, expired, already, full, give_failed.
 */
export async function acceptInvite(client, member, roleId, sentAt, { now = Date.now(), settings = customRoleSettings } = {}) {
    const { guild } = member;
    if (now - sentAt > settings.inviteHours * 60 * 60 * 1000) return { ok: false, reason: 'expired' };
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) return { ok: false, reason: 'gone' };
    return withRoles(client, guild.id, async (roles) => {
        const record = roles[roleId];
        if (!record) return { ok: false, reason: 'gone', skipSave: true };
        if (record.members.includes(member.id)) return { ok: false, reason: 'already', skipSave: true };
        if (record.members.length >= record.maxMembers) return { ok: false, reason: 'full', skipSave: true };
        const given = await member.roles.add(role, 'CC store: joined a friends role').then(() => true).catch(() => false);
        if (!given) return { ok: false, reason: 'give_failed', skipSave: true };
        record.members.push(member.id);
        return { ok: true, record };
    });
}

async function takeRole(guild, userId, roleId, reason) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await member.roles.remove(roleId, reason).catch(() => {});
}

/** The leader removes a member. Reasons: no_role, self, not_member. */
export async function removeMember(client, guild, leaderId, targetId) {
    return withRoles(client, guild.id, async (roles) => {
        const record = ledRole(Object.values(roles), leaderId, 'friends');
        if (!record) return { ok: false, reason: 'no_role', skipSave: true };
        if (targetId === leaderId) return { ok: false, reason: 'self', skipSave: true };
        if (!record.members.includes(targetId)) return { ok: false, reason: 'not_member', skipSave: true };
        record.members = record.members.filter((id) => id !== targetId);
        await takeRole(guild, targetId, record.roleId, 'CC store: removed by the role leader');
        return { ok: true, record };
    });
}

/** A member leaves a friends role (`roleId`, or the only one they are in). Reasons: none, pick, leader. */
export async function leaveRole(client, guild, userId, roleId = null) {
    return withRoles(client, guild.id, async (roles) => {
        const joined = Object.values(roles).filter((record) => record.kind === 'friends' && record.members.includes(userId));
        const choices = roleId ? joined.filter((record) => record.roleId === roleId) : joined;
        if (!choices.length) return { ok: false, reason: 'none', skipSave: true };
        if (choices.length > 1) return { ok: false, reason: 'pick', skipSave: true, records: choices };
        const [record] = choices;
        if (record.leaderId === userId) return { ok: false, reason: 'leader', skipSave: true };
        record.members = record.members.filter((id) => id !== userId);
        await takeRole(guild, userId, record.roleId, 'CC store: left the friends role');
        return { ok: true, record };
    });
}

/** The leader hands the friends role to another member of it. Reasons: no_role, self, not_member. */
export async function handOver(client, guild, leaderId, targetId) {
    return withRoles(client, guild.id, async (roles) => {
        const record = ledRole(Object.values(roles), leaderId, 'friends');
        if (!record) return { ok: false, reason: 'no_role', skipSave: true };
        if (targetId === leaderId) return { ok: false, reason: 'self', skipSave: true };
        if (!record.members.includes(targetId)) return { ok: false, reason: 'not_member', skipSave: true };
        if (ledRole(Object.values(roles), targetId, 'friends')) return { ok: false, reason: 'leads_one', skipSave: true };
        record.leaderId = targetId;
        record.remindedFor = null;
        return { ok: true, record };
    });
}

/**
 * The leader stops (or restarts) the renewal of their role of `kind` (or their only role). The role stays
 * until `paidUntil`. Reasons: no_role, pick (leads both kinds).
 */
export async function setCancelled(client, guild, leaderId, kind, cancelled) {
    return withRoles(client, guild.id, async (roles) => {
        const led = Object.values(roles).filter((record) => record.leaderId === leaderId && (!kind || record.kind === kind));
        if (!led.length) return { ok: false, reason: 'no_role', skipSave: true };
        if (led.length > 1) return { ok: false, reason: 'pick', skipSave: true };
        led[0].cancelled = cancelled;
        return { ok: true, record: led[0] };
    });
}

async function dmUser(client, userId, content) {
    const user = await client.users.fetch(userId).catch(() => null);
    await user?.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
}

/**
 * What the renewal check does with one role at `now`: 'keep', 'remind', 'renew', 'grace' (couldn't pay,
 * waiting), or 'end'. `canPay` says whether the leader has the price in CC.
 */
export function renewalStep(record, now, canPay, settings = customRoleSettings) {
    if (now < record.paidUntil) {
        const remindAt = record.paidUntil - settings.remindDaysBefore * DAY_MS;
        return !record.cancelled && now >= remindAt && record.remindedFor !== record.paidUntil ? 'remind' : 'keep';
    }
    if (record.cancelled) return 'end';
    if (canPay) return 'renew';
    const graceUntil = record.graceUntil || record.paidUntil + settings.graceDays * DAY_MS;
    return now >= graceUntil ? 'end' : 'grace';
}

async function endRole(guild, record, reason) {
    const role = guild.roles.cache.get(record.roleId) || await guild.roles.fetch(record.roleId).catch(() => null);
    if (role) await role.delete(reason).catch((error) => logger.warn(`[CUSTOM_ROLE] Could not delete ${record.roleId}: ${error.message}`));
}

/** One renewal check of every custom role in the guild. Returns counts of what happened. */
export async function sweepGuildCustomRoles(client, guild, { now = Date.now(), settings = customRoleSettings } = {}) {
    const summary = { renewed: 0, reminded: 0, ended: 0, grace: 0 };
    await withRoles(client, guild.id, async (roles) => {
        for (const record of Object.values(roles)) {
            const role = guild.roles.cache.get(record.roleId) || await guild.roles.fetch(record.roleId).catch(() => null);
            // Deleted by hand: forget it.
            if (!role) {
                delete roles[record.roleId];
                continue;
            }
            const due = now >= record.paidUntil && !record.cancelled;
            const step = renewalStep(record, now, due ? await leaderCanPay(client, guild, record) : false, settings);
            const label = `**${record.name}**`;
            if (step === 'remind') {
                record.remindedFor = record.paidUntil;
                summary.reminded += 1;
                await dmUser(client, record.leaderId, `⏰ اشتراك رول ${label} في **${guild.name}** هيتجدد <t:${Math.floor(record.paidUntil / 1000)}:R> بـ ${formatCC(record.price)} من رصيدك. لو مش عايز تجدد اكتب \`رولي الغي\`.`);
            } else if (step === 'renew') {
                const paid = await spendCC(client, guild.id, record.leaderId, record.price, `custom role renewal ${record.roleId}`);
                if (!paid.ok) continue;
                record.paidUntil += settings.days * DAY_MS;
                record.graceUntil = null;
                summary.renewed += 1;
                await dmUser(client, record.leaderId, `✅ اتجدد اشتراك رول ${label} في **${guild.name}** شهر كمان (${formatCC(record.price)}). رصيدك دلوقتي ${formatCC(paid.balance)}.`);
            } else if (step === 'grace') {
                if (!record.graceUntil) {
                    record.graceUntil = record.paidUntil + settings.graceDays * DAY_MS;
                    await dmUser(client, record.leaderId, `⚠️ رصيدك مش كفاية تجدد رول ${label} في **${guild.name}** (${formatCC(record.price)}). قدامك لحد <t:${Math.floor(record.graceUntil / 1000)}:R> تجمع الـ ${CC.short}، وبعدها الرول هتتمسح.`);
                }
                summary.grace += 1;
            } else if (step === 'end') {
                await endRole(guild, record, record.cancelled ? 'CC store: subscription cancelled' : 'CC store: subscription not paid');
                delete roles[record.roleId];
                summary.ended += 1;
                await dmUser(client, record.leaderId, `🗑️ رول ${label} في **${guild.name}** اتمسحت عشان ${record.cancelled ? 'الاشتراك اتلغى' : 'الاشتراك ما اتجددش'}.`);
            }
        }
    });
    return summary;
}

async function leaderCanPay(client, guild, record) {
    const inGuild = await guild.members.fetch(record.leaderId).then(() => true).catch(() => false);
    if (!inGuild) return false;
    const { cc } = await getProfile(client, guild.id, record.leaderId);
    return cc >= record.price;
}

export async function sweepCustomRoles(client, options = {}) {
    for (const guild of client.guilds.cache.values()) {
        // Custom roles are sold in our server only.
        if (!isHomeGuild(guild.id)) continue;
        const records = await listCustomRoles(client, guild.id).catch(() => []);
        if (!records.length) continue;
        const summary = await sweepGuildCustomRoles(client, guild, options).catch((error) => {
            logger.error(`[CUSTOM_ROLE] Renewal check failed in ${guild.id}`, error);
            return null;
        });
        if (summary && (summary.renewed || summary.ended)) logger.info('[CUSTOM_ROLE] Renewal check', { guildId: guild.id, ...summary });
    }
}

/** Starts the renewal check (on startup and every `checkEveryMinutes`). */
export async function startCustomRoles(client, settings = customRoleSettings) {
    const run = () => sweepCustomRoles(client).catch((error) => logger.error('Custom roles check failed:', error));
    await run();
    setInterval(run, settings.checkEveryMinutes * 60 * 1000).unref?.();
    return { status: 'started' };
}

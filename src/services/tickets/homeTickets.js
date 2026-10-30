// homeTickets.js — the tickets of our server (owner's request), in our server only.
//
// On startup the bot makes (once) a "🎫 التكتات" category with:
//   • 📩・افتح-تكت — everyone can read it, nobody can write; a panel with two buttons, one per section
//   • 📁・سجل-التكتات — staff only; each closed ticket's transcript is posted here
//
// Sections (each with the team role the owner chose, mentioned when a ticket opens: SECTION_ROLE_IDS):
//   • 🛠️ مشكلة       — a problem or a report; its role and the staff roles (staffRoleHierarchyService.js) see it
//   • 🎀 توثيق بنات  — girls' verification; only its role sees it, and its ✅ button gives the opener
//                     the verified girl role (VERIFIED_ROLE_ID)
// A ticket is a private room in the category (`🛠・مشكلة-0007`), seen by its opener and that section's
// team. One open ticket per member per section. In it: 🙋 استلام (staff), 🔒 قفل (the opener or staff:
// the transcript goes to the log room and the room is deleted), and ✅ توثيق for verification.

import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, OverwriteType, PermissionFlagsBits,
} from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { filterStaffRoles } from '../staffRoleHierarchyService.js';
import { findBoardMessage, rememberBoardMessage } from '../../utils/boardMessage.js';
import { logger } from '../../utils/logger.js';

export const TICKET_BUTTON_PREFIX = 'hticket';
export const TICKET_NAMES = {
    category: '🎫 التكتات',
    panel: '📩・افتح-تكت',
    log: '📁・سجل-التكتات',
};
// The verified girl role, given by ✅ in a verification ticket.
export const VERIFIED_ROLE_ID = '1551151228833234985';
// The role mentioned (and given access) when a ticket of each section opens.
export const SECTION_ROLE_IDS = {
    problem: '1552756864712708275',
    verify: '1552416342278414376',
};
const PANEL_KEY = 'homeTicketsPanel';
const OPEN_COOLDOWN_MS = 60_000;
const CLOSE_DELAY_MS = 5_000;
const TRANSCRIPT_LIMIT = 500;

export const SECTIONS = {
    problem: {
        emoji: '🛠️',
        channelEmoji: '🛠',
        label: 'مشكلة',
        title: '🛠️ تكت مشكلة',
        panelLine: '🛠️ **مشكلة** — عندك مشكلة، شكوى على حد، أو سؤال للإدارة',
        intro: 'اكتب مشكلتك بالتفصيل، ولو معاك صور أو إثبات ابعتها هنا. حد من الإدارة هيرد عليك قريب.',
        style: ButtonStyle.Primary,
    },
    verify: {
        emoji: '🎀',
        channelEmoji: '🎀',
        label: 'توثيق بنات',
        title: '🎀 تكت توثيق',
        panelLine: `🎀 **توثيق بنات** — للبنات بس، عشان تاخدي رول <@&${VERIFIED_ROLE_ID}>`,
        intro: 'أهلاً بيكي 🎀 المسؤولة عن التوثيق هتكلمك هنا وتقولك تعملي إيه. محدش غير المسؤولين عن التوثيق يقدر يشوف التكت ده.',
        style: ButtonStyle.Secondary,
    },
};

const stateKey = (guildId) => `guild:${guildId}:hometickets`;
const lastOpen = new Map(); // guildId:userId -> time

async function readState(client, guildId) {
    const state = await client.db.get(stateKey(guildId), null);
    return { counter: 0, open: {}, ...(state || {}) };
}

async function writeState(client, guildId, state) {
    await client.db.set(stateKey(guildId), state);
}

function panelPayload() {
    const row = new ActionRowBuilder().addComponents(
        ...Object.entries(SECTIONS).map(([type, section]) => new ButtonBuilder()
            .setCustomId(`${TICKET_BUTTON_PREFIX}:open:${type}`)
            .setLabel(section.label)
            .setEmoji(section.emoji)
            .setStyle(section.style)),
    );
    return {
        embeds: [{
            color: 0x5865f2,
            title: '🎫 التكتات',
            description: [
                'اختار القسم اللي محتاجه، والبوت هيفتحلك روم خاصة بيك:',
                '',
                ...Object.values(SECTIONS).map((section) => section.panelLine),
                '',
                '• تكت واحد مفتوح لكل قسم.',
                '• متفتحش تكت من غير سبب.',
            ].join('\n'),
            footer: { text: 'تكتات السيرفر' },
        }],
        components: [row],
        allowedMentions: { parse: [] },
    };
}

const isPanel = (message) => message.embeds?.[0]?.footer?.text === 'تكتات السيرفر';

/** The roles that see problem tickets: the staff roles and the trusted roles. */
async function staffRoleIds(guild) {
    const staff = await filterStaffRoles(guild, guild.roles.cache.values());
    const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
    return [...new Set([...staff.map((role) => role.id), ...(config?.antiNukeTrustedRoles || [])])]
        .filter((id) => guild.roles.cache.has(id));
}

/** The team that handles a section: its role, plus the staff roles for problems. */
async function sectionTeam(guild, type) {
    const own = [SECTION_ROLE_IDS[type]].filter((id) => guild.roles.cache.has(id));
    if (type === 'verify') return own;
    return [...new Set([...own, ...(await staffRoleIds(guild))])];
}

/** The role mentioned when a ticket of `type` opens. */
const sectionPing = (guild, type) => [SECTION_ROLE_IDS[type]].filter((id) => guild.roles.cache.has(id));

async function canHandle(member, type, state) {
    if (!member) return false;
    if (isServerOwner(member.id) || member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    const team = await sectionTeam(member.guild, type);
    return team.some((roleId) => member.roles?.cache?.has(roleId));
}

/** Makes the category, the panel and log rooms, the two roles, and posts or edits the panel. */
export async function setupHomeTickets(guild) {
    if (!isHomeGuild(guild?.id)) return null;
    const { client } = guild;
    const state = await readState(client, guild.id);
    const me = guild.members.me;


    let category = state.categoryId && guild.channels.cache.get(state.categoryId);
    if (!category) {
        category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === TICKET_NAMES.category)
            || await guild.channels.create({ name: TICKET_NAMES.category, type: ChannelType.GuildCategory, reason: 'Tickets' });
    }
    state.categoryId = category.id;

    const inCategory = (name) => guild.channels.cache.find((channel) => channel.parentId === category.id && channel.name === name);
    const botAllow = me ? [{ id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }] : [];

    let panel = (state.panelChannelId && guild.channels.cache.get(state.panelChannelId)) || inCategory(TICKET_NAMES.panel);
    if (!panel) {
        panel = await guild.channels.create({
            name: TICKET_NAMES.panel,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: 'Tickets: panel room',
            permissionOverwrites: [
                { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads] },
                ...botAllow,
            ],
        });
    }
    state.panelChannelId = panel.id;

    // The log room is for the staff and both sections' teams.
    const staffIds = [...new Set([...(await staffRoleIds(guild)), ...Object.values(SECTION_ROLE_IDS).filter((id) => guild.roles.cache.has(id))])];
    let log = (state.logChannelId && guild.channels.cache.get(state.logChannelId)) || inCategory(TICKET_NAMES.log);
    if (!log) {
        log = await guild.channels.create({
            name: TICKET_NAMES.log,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: 'Tickets: transcripts',
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                ...staffIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] })),
                ...botAllow,
            ],
        });
    }
    state.logChannelId = log.id;
    await writeState(client, guild.id, state);

    const board = await findBoardMessage(panel, PANEL_KEY, isPanel).catch(() => null);
    if (board) await board.edit(panelPayload()).catch(() => {});
    else {
        const sent = await panel.send(panelPayload());
        await rememberBoardMessage(panel, PANEL_KEY, sent.id);
    }
    return { categoryId: category.id, panelChannelId: panel.id, logChannelId: log.id };
}

export function ticketControls(type, { claimedBy = null } = {}) {
    const buttons = [
        new ButtonBuilder().setCustomId(`${TICKET_BUTTON_PREFIX}:claim`).setLabel(claimedBy ? 'مستلم' : 'استلام').setEmoji('🙋').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(claimedBy)),
        new ButtonBuilder().setCustomId(`${TICKET_BUTTON_PREFIX}:close`).setLabel('قفل').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    ];
    if (type === 'verify') {
        buttons.unshift(new ButtonBuilder().setCustomId(`${TICKET_BUTTON_PREFIX}:verify`).setLabel('توثيق').setEmoji('✅').setStyle(ButtonStyle.Success));
    }
    return [new ActionRowBuilder().addComponents(...buttons)];
}

/**
 * Opens a ticket of `type` for `member`. Returns `{ ok: true, channel }` or `{ ok: false, reason, channelId? }`
 * with reason one of: not_home, bad_type, not_ready, has_open, cooldown, create_failed.
 */
export async function openTicket(member, type, { now = Date.now() } = {}) {
    const { guild } = member;
    if (!isHomeGuild(guild.id)) return { ok: false, reason: 'not_home' };
    const section = SECTIONS[type];
    if (!section) return { ok: false, reason: 'bad_type' };
    const state = await readState(guild.client, guild.id);
    if (!state.categoryId) return { ok: false, reason: 'not_ready' };

    // Tickets whose room is gone are forgotten.
    for (const [channelId] of Object.entries(state.open)) if (!guild.channels.cache.has(channelId)) delete state.open[channelId];
    const mine = Object.entries(state.open).find(([, ticket]) => ticket.ownerId === member.id && ticket.type === type);
    if (mine) return { ok: false, reason: 'has_open', channelId: mine[0] };
    const cooldownKey = `${guild.id}:${member.id}`;
    if (now - (lastOpen.get(cooldownKey) ?? -Infinity) < OPEN_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
    lastOpen.set(cooldownKey, now);

    state.counter += 1;
    const number = String(state.counter).padStart(4, '0');
    const team = await sectionTeam(guild, type);
    const ping = sectionPing(guild, type);
    const me = guild.members.me;
    const channel = await guild.channels.create({
        name: `${section.channelEmoji}・${section.label.split(' ')[0]}-${number}`,
        type: ChannelType.GuildText,
        parent: state.categoryId,
        topic: `${section.title} ・ ${member.user?.tag || member.id} (${member.id})`,
        reason: `Ticket ${number} (${type}) by ${member.id}`,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: member.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
            ...team.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] })),
            ...(me ? [{ id: me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }] : []),
        ],
    }).catch((error) => {
        logger.warn(`[TICKETS] Could not open a ticket for ${member.id}: ${error.message}`);
        return null;
    });
    if (!channel) return { ok: false, reason: 'create_failed' };

    state.open[channel.id] = { type, ownerId: member.id, number, claimedBy: null, createdAt: now };
    await writeState(guild.client, guild.id, state);
    await channel.send({
        content: [`<@${member.id}>`, ...ping.map((id) => `<@&${id}>`)].join(' '),
        embeds: [{
            color: type === 'verify' ? 0xff6fa8 : 0x3498db,
            title: `${section.title} #${number}`,
            description: [section.intro, '', `👤 فتحه: <@${member.id}>`, '🔒 لما تخلص دوس **قفل**.'].join('\n'),
        }],
        components: ticketControls(type),
        allowedMentions: { users: [member.id], roles: ping },
    }).catch(() => {});
    return { ok: true, channel, number };
}

/** 🙋: a team member takes the ticket. Returns `{ ok, reason? }`. */
export async function claimTicket(channel, member) {
    const state = await readState(channel.client, channel.guild.id);
    const ticket = state.open[channel.id];
    if (!ticket) return { ok: false, reason: 'not_ticket' };
    if (!(await canHandle(member, ticket.type, state))) return { ok: false, reason: 'not_team' };
    if (ticket.claimedBy) return { ok: false, reason: 'claimed' };
    ticket.claimedBy = member.id;
    await writeState(channel.client, channel.guild.id, state);
    return { ok: true, ticket };
}

/** ✅ in a verification ticket: gives the opener the verified role. */
export async function verifyTicket(channel, member) {
    const { guild } = channel;
    const state = await readState(channel.client, guild.id);
    const ticket = state.open[channel.id];
    if (!ticket || ticket.type !== 'verify') return { ok: false, reason: 'not_ticket' };
    if (!(await canHandle(member, 'verify', state))) return { ok: false, reason: 'not_team' };
    const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
    const owner = await guild.members.fetch(ticket.ownerId).catch(() => null);
    if (!role || !owner) return { ok: false, reason: 'no_role' };
    const added = await owner.roles.add(role, `Verified by ${member.id}`).then(() => true).catch(() => false);
    return added ? { ok: true, ticket, roleId: role.id } : { ok: false, reason: 'no_role' };
}

function transcript(messages) {
    return [...messages.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((message) => {
            const files = [...(message.attachments?.values?.() || [])].map((file) => ` [${file.name}: ${file.url}]`).join('');
            const text = message.content || (message.embeds?.length ? `[${message.embeds[0].title || 'embed'}]` : '');
            return `[${new Date(message.createdTimestamp).toISOString().replace('T', ' ').slice(0, 16)}] ${message.author?.tag || message.author?.id}: ${text}${files}`;
        })
        .join('\n');
}

/**
 * 🔒: the opener or the team closes the ticket. The transcript goes to the log room and the room is
 * deleted after a few seconds. Returns `{ ok, reason? }`.
 */
export async function closeTicket(channel, member, { deleteAfterMs = CLOSE_DELAY_MS } = {}) {
    const { guild } = channel;
    const state = await readState(channel.client, guild.id);
    const ticket = state.open[channel.id];
    if (!ticket) return { ok: false, reason: 'not_ticket' };
    if (ticket.ownerId !== member.id && !(await canHandle(member, ticket.type, state))) return { ok: false, reason: 'not_team' };
    delete state.open[channel.id];
    await writeState(channel.client, guild.id, state);

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => new Map());
    const log = state.logChannelId && guild.channels.cache.get(state.logChannelId);
    const section = SECTIONS[ticket.type];
    await log?.send({
        embeds: [{
            color: 0x95a5a6,
            title: `${section.title} #${ticket.number} اتقفل`,
            description: [
                `👤 فتحه: <@${ticket.ownerId}>`,
                ticket.claimedBy ? `🙋 استلمه: <@${ticket.claimedBy}>` : null,
                `🔒 قفله: <@${member.id}>`,
                `🕒 اتفتح: <t:${Math.floor(ticket.createdAt / 1000)}:f>`,
            ].filter(Boolean).join('\n'),
        }],
        files: [{ attachment: Buffer.from(transcript(messages).slice(-TRANSCRIPT_LIMIT * 200) || '—', 'utf8'), name: `ticket-${ticket.number}.txt` }],
        allowedMentions: { parse: [] },
    }).catch((error) => logger.warn(`[TICKETS] Could not post transcript ${ticket.number}: ${error.message}`));

    await channel.send({ content: `🔒 التكت اتقفل بواسطة <@${member.id}>، الروم هتتمسح بعد ${Math.round(deleteAfterMs / 1000)} ثواني.`, allowedMentions: { parse: [] } }).catch(() => {});
    setTimeout(() => channel.delete('Ticket closed').catch(() => {}), deleteAfterMs).unref?.();
    return { ok: true, ticket };
}

export const TICKET_FAILURE_TEXT = {
    not_home: '❌ التكتات مش متاحة هنا.',
    bad_type: '❌ القسم ده مش موجود.',
    not_ready: '⏳ التكتات لسه بتتجهز، جرب كمان دقيقة.',
    has_open: 'ℹ️ عندك تكت مفتوح في القسم ده أصلاً.',
    cooldown: '⏳ استنى دقيقة قبل ما تفتح تكت تاني.',
    create_failed: '❌ مقدرتش أفتح التكت، بلّغ الإدارة.',
    not_ticket: 'ℹ️ التكت ده اتقفل خلاص.',
    not_team: '❌ الزرار ده للإدارة المسؤولة عن التكت ده بس.',
    claimed: 'ℹ️ التكت ده حد استلمه خلاص.',
    no_role: `❌ مقدرتش أدي الرول، اتأكد إن رول البوت فوق <@&${VERIFIED_ROLE_ID}>.`,
};

/** Startup: sets up the tickets in our server. */
export async function startHomeTickets(client) {
    for (const guild of client.guilds.cache.values()) {
        if (!isHomeGuild(guild.id)) continue;
        return { status: 'ready', ...(await setupHomeTickets(guild)) };
    }
    return { status: 'skipped' };
}


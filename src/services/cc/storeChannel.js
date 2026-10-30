// storeChannel.js — the store room: a text channel the bot creates in STORE_CATEGORY_ID.
//   • Only store commands can be written there (`متجر`، `متجر 1`، `مخزني`، `اسعار`، `شراء عربية`، `رصيد`، `توب cc`، `رولي`، `/store`...);
//     anything else is deleted with a short notice that goes away after a few seconds. The server
//     owners and this bot are left alone. Other slash commands get a private "store only" reply.
//   • The store panel (storeUi.js) is pinned. Every `repostEvery` member messages under it, the old
//     panel is deleted and it is sent (and pinned) again so it is always near the bottom. The
//     "pinned a message" notices Discord posts are deleted.
// The channel ID is saved in the guild config (`storeChannelId`), so renaming the room keeps it.

import { ChannelType, MessageType, OverwriteType, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../config/guildConfig.js';
import { getCommandPrefix } from '../../config/bot.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { STORE_CATEGORY_ID, STORE_CHANNEL_NAME, storeRoomSettings } from '../../config/store/ccStoreItems.js';
import { findBoardMessage, rememberBoardMessage } from '../../utils/boardMessage.js';
import { typedCommandName } from '../games/gamesChannel.js';
import { buildStorePanel, isStorePanelFooter } from './storeUi.js';
import { logger } from '../../utils/logger.js';

export const STORE_COMMAND_NAMES = new Set(['store', 'bourse', 'cc', 'cctop', 'guide', 'myrole']);
export const STORE_ONLY_NOTICE = '🛒 الروم ده لأوامر المتجر بس. اكتب `متجر` عشان تشوف المنتجات.';
const CONFIG_KEY = 'storeChannelId';
const BOARD_KEY = 'store';
const NOTICE_DELETE_MS = 4_000;
const NOTICE_COOLDOWN_MS = 10_000;

// guildId -> channelId of the store room, filled at startup.
const storeChannels = new Map();
// channelId -> member messages under the current panel.
const messagesSincePanel = new Map();
const lastNotice = new Map();
let queue = Promise.resolve();

export function isStoreChannel(channelId) {
    return [...storeChannels.values()].includes(channelId);
}

/** Remembers the store room of a guild (used at startup and by the tests). */
export function setStoreChannel(guildId, channelId) {
    if (channelId) storeChannels.set(guildId, channelId);
    else storeChannels.delete(guildId);
}

export function isStorePanel(message) {
    return Boolean(message.embeds?.some((embed) => isStorePanelFooter(embed?.footer?.text)));
}

export function isStoreCommandMessage(content, prefixes) {
    return prefixes.some((prefix) => STORE_COMMAND_NAMES.has(typedCommandName(content, prefix)));
}

/** Whether a slash command must be refused in `channelId` because it isn't a store command. */
export function isBlockedStoreSlashCommand(channelId, commandName, userId) {
    return isStoreChannel(channelId) && !STORE_COMMAND_NAMES.has(commandName) && !isServerOwner(userId);
}

async function sendNotice(message) {
    const authorId = message.author.id;
    const now = Date.now();
    if (now - (lastNotice.get(authorId) || 0) < NOTICE_COOLDOWN_MS) return;
    lastNotice.set(authorId, now);
    const notice = await message.channel.send({
        content: `<@${authorId}> ${STORE_ONLY_NOTICE}`,
        allowedMentions: { users: [authorId] },
    }).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), NOTICE_DELETE_MS);
}

/**
 * Keeps the store room for store commands only and counts the messages under the panel.
 * Returns true when the message was deleted (the caller must stop handling it).
 */
export async function handleStoreChannelMessage(message, client) {
    if (!message.guild || !isStoreChannel(message.channelId)) return false;
    // Discord's "pinned a message" notice for our own pin.
    if (message.type === MessageType.ChannelPinnedMessage) {
        if (message.author?.id === message.client.user?.id) await message.delete().catch(() => {});
        return true;
    }
    const authorId = message.author?.id;
    if (authorId === message.client.user?.id) return false;

    let allowed = isServerOwner(authorId);
    if (!allowed && !message.author?.bot && !message.webhookId) {
        const guildConfig = await getGuildConfig(client, message.guild.id).catch(() => null);
        const prefixes = [...new Set([guildConfig?.prefix, getCommandPrefix()].filter(Boolean))];
        allowed = isStoreCommandMessage(message.content || '', prefixes);
    }

    if (!allowed) {
        await message.delete().catch(() => {});
        if (!message.author?.bot && !message.webhookId) await sendNotice(message);
        return true;
    }

    countStoreMessage(client, message.channel);
    return false;
}

/** Counts one member message under the panel and sends the panel again every `repostEvery`. */
export function countStoreMessage(client, channel) {
    const count = (messagesSincePanel.get(channel.id) || 0) + 1;
    messagesSincePanel.set(channel.id, count);
    if (count < storeRoomSettings.repostEvery) return;
    messagesSincePanel.set(channel.id, 0);
    // Let the command reply land first so the panel ends up under it.
    setTimeout(() => {
        publishStorePanel(client, channel, { repost: true }).catch((error) => logger.error('Failed to repost the store panel:', error));
    }, 1_500).unref?.();
}

async function publish(client, channel, repost) {
    const existing = await findBoardMessage(channel, BOARD_KEY, isStorePanel);
    const payload = buildStorePanel(channel.guild);
    if (existing && !repost) {
        await existing.edit(payload);
        if (!existing.pinned) await existing.pin().catch(() => {});
        return { status: 'updated', channelId: channel.id };
    }
    const sent = await channel.send(payload);
    await rememberBoardMessage(channel, BOARD_KEY, sent.id);
    await sent.pin().catch((error) => logger.warn(`Could not pin the store panel in ${channel.id}: ${error.message}`));
    if (existing) await existing.delete().catch(() => {});
    messagesSincePanel.set(channel.id, 0);
    return { status: existing ? 'reposted' : 'sent', channelId: channel.id };
}

/**
 * Sends the store panel (or edits it in place). With `repost` the old panel is deleted and a new
 * one is sent under the latest messages. Calls run one after another so the panel is never doubled.
 */
export function publishStorePanel(client, channel, { repost = false } = {}) {
    const run = queue.then(() => publish(client, channel, repost));
    queue = run.catch(() => {});
    return run;
}

/** The permission overwrites of a new store room: the category's, plus what the room needs. */
export function storeRoomOverwrites(category, guild, botId) {
    const overwrites = [...(category?.permissionOverwrites?.cache?.values() || [])].map((overwrite) => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
    }));
    const everyone = overwrites.find((overwrite) => overwrite.id === guild.id);
    const noExtras = [
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.SendPolls,
        PermissionFlagsBits.SendVoiceMessages,
    ].reduce((bits, flag) => bits | flag, 0n);
    // Members must be able to type commands; who can see the room still comes from the category.
    const canType = PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory;
    if (everyone) {
        everyone.allow = (BigInt(everyone.allow) | canType) & ~noExtras;
        everyone.deny = (BigInt(everyone.deny) | noExtras) & ~canType;
    } else {
        overwrites.push({ id: guild.id, type: OverwriteType.Role, allow: canType, deny: noExtras });
    }

    const botAllow = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
    ].reduce((bits, flag) => bits | flag, 0n);
    const others = overwrites.filter((overwrite) => overwrite.id !== botId);
    return [...others, { id: botId, type: OverwriteType.Member, allow: botAllow }];
}

async function ensureStoreChannel(client, guild) {
    const category = guild.channels.cache.get(STORE_CATEGORY_ID) || await guild.channels.fetch(STORE_CATEGORY_ID).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) return null;

    const config = await getGuildConfig(client, guild.id).catch(() => null);
    const savedId = config?.[CONFIG_KEY];
    let channel = savedId ? guild.channels.cache.get(savedId) || await guild.channels.fetch(savedId).catch(() => null) : null;
    if (!channel?.isTextBased?.()) {
        channel = guild.channels.cache.find((candidate) => candidate.parentId === category.id
            && candidate.type === ChannelType.GuildText && candidate.name === STORE_CHANNEL_NAME) || null;
    }
    if (!channel) {
        channel = await guild.channels.create({
            name: STORE_CHANNEL_NAME,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: '🛒 متجر الـ CC • أوامر المتجر بس • اكتب متجر عشان تشوف المنتجات',
            rateLimitPerUser: storeRoomSettings.slowmodeSeconds,
            permissionOverwrites: storeRoomOverwrites(category, guild, client.user.id),
            reason: 'Store room',
        });
        logger.info(`Created the store room ${channel.id} in ${guild.name}`);
    }
    if (savedId !== channel.id) await updateGuildConfig(client, guild.id, { [CONFIG_KEY]: channel.id }).catch(() => {});
    return channel;
}

/** Counts the member messages already under the panel (after a restart). */
async function countMessagesUnderPanel(channel, panel) {
    if (!panel) return 0;
    const after = await channel.messages.fetch({ after: panel.id, limit: 100 }).catch(() => null);
    return after ? [...after.values()].filter((message) => !message.author?.bot && !message.system).length : 0;
}

/** Creates the store room when needed and makes sure the panel is there. Failures are logged, never thrown. */
export async function startStoreChannel(client) {
    const results = [];
    for (const guild of client.guilds.cache.values()) {
        try {
            const channel = await ensureStoreChannel(client, guild);
            if (!channel) continue;
            setStoreChannel(guild.id, channel.id);
            const panel = await findBoardMessage(channel, BOARD_KEY, isStorePanel);
            const under = await countMessagesUnderPanel(channel, panel);
            const result = await publishStorePanel(client, channel, { repost: under >= storeRoomSettings.repostEvery });
            if (result.status === 'updated') messagesSincePanel.set(channel.id, under);
            results.push(result);
        } catch (error) {
            logger.error(`Failed to set up the store room in ${guild.name}:`, error);
        }
    }
    return results;
}

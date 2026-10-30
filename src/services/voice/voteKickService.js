// voteKickService.js — vote kick in a voice channel (reports #183, #185), in our server only.
//
// From a voice channel's own text chat, a member in that channel types `فوت كيك @member [reason]`
// (or `/votekick`). The bot mentions everyone in the channel and asks them to vote with ✅ / ❌.
// The one who started counts as the first vote. When enough members in the channel vote within
// VOTE_KICK.durationMs, the member is disconnected and can't join that channel again: the channel gets a
// Connect deny for them, and joining anyway (an admin, or the deny failed) disconnects them again.
// The block lifts when the channel is empty (the game is over) or after VOTE_KICK.blockMs at most.
// Owners, staff who can move members, and bots can't be vote kicked.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { getVoteKickBlocksKey } from '../../utils/database/keys.js';
import { logger } from '../../utils/logger.js';

export const VOTE_KICK = {
    durationMs: 60_000,
    // Members in the channel, the target included, for a vote to start.
    minMembers: 3,
    blockMs: 60 * 60_000,
    // How long one member waits between two vote kicks they start.
    cooldownMs: 2 * 60_000,
    checkEveryMs: 60_000,
};
export const VOTE_KICK_BUTTON_PREFIX = 'votekick';

const votes = new Map(); // voteId -> vote
const lastStarted = new Map(); // guildId:userId -> time

/** Votes needed: half of the others in the channel (rounded down), at least 2. 12 in the channel → 5. */
export function votesRequired(membersInChannel) {
    return Math.max(2, Math.floor((membersInChannel - 1) / 2));
}

function humans(channel) {
    return [...(channel.members?.values?.() || [])].filter((member) => !member.user?.bot);
}

function isProtected(member) {
    return isServerOwner(member.id)
        || Boolean(member.user?.bot)
        || Boolean(member.permissions?.has?.(PermissionFlagsBits.MoveMembers));
}

/**
 * Checks and opens a vote. Returns `{ ok: true, vote }` or `{ ok: false, reason }` with reason one of:
 * not_home, not_voice_chat, not_in_channel, target_missing, self, protected, too_few, running, cooldown.
 */
export function startVoteKick({ guild, channel, starter, target, reason = null, now = Date.now() }) {
    if (!isHomeGuild(guild?.id)) return { ok: false, reason: 'not_home' };
    if (!channel?.isVoiceBased?.()) return { ok: false, reason: 'not_voice_chat' };
    if (starter?.voice?.channelId !== channel.id) return { ok: false, reason: 'not_in_channel' };
    if (!target || target.voice?.channelId !== channel.id) return { ok: false, reason: 'target_missing' };
    if (target.id === starter.id) return { ok: false, reason: 'self' };
    if (isProtected(target)) return { ok: false, reason: 'protected' };
    const present = humans(channel);
    if (present.length < VOTE_KICK.minMembers) return { ok: false, reason: 'too_few' };
    if ([...votes.values()].some((vote) => vote.channelId === channel.id && !vote.done)) return { ok: false, reason: 'running' };
    const cooldownKey = `${guild.id}:${starter.id}`;
    if (now - (lastStarted.get(cooldownKey) || -Infinity) < VOTE_KICK.cooldownMs) return { ok: false, reason: 'cooldown' };
    lastStarted.set(cooldownKey, now);

    const vote = {
        id: `${channel.id}-${now}`,
        guildId: guild.id,
        channelId: channel.id,
        channelName: channel.name,
        targetId: target.id,
        starterId: starter.id,
        reason: reason ? String(reason).slice(0, 200) : null,
        required: votesRequired(present.length),
        yes: new Set([starter.id]),
        no: new Set(),
        endsAt: now + VOTE_KICK.durationMs,
        done: false,
        mentions: present.map((member) => member.id),
    };
    votes.set(vote.id, vote);
    return { ok: true, vote };
}

export function getVote(voteId) {
    return votes.get(voteId) || null;
}

/**
 * The vote message, laid out like the Among Us bot's (the owner's screenshot): everyone in the channel
 * mentioned, the question, the votes needed, the end time and the reason, with a green ✅ and a red ❌
 * button that show their counts.
 */
export function voteKickPayload(vote, { ended = null } = {}) {
    const lines = [
        `**عايزين تطردوا <@${vote.targetId}> من 🔊 ${vote.channelName}؟**`,
        '',
        `⬆️ **الأصوات المطلوبة:** \`${vote.required}\``,
        ended ? `🕒 **التصويت:** ${ended}` : `🕒 **التصويت بيخلص:** <t:${Math.floor(vote.endsAt / 1000)}:R>`,
        `📝 **السبب:** \`${vote.reason || 'من غير سبب'}\``,
    ];
    const closed = Boolean(ended) || vote.done;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${VOTE_KICK_BUTTON_PREFIX}:yes:${vote.id}`)
            .setLabel(`${vote.yes.size} / ${vote.required}`)
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(closed),
        new ButtonBuilder()
            .setCustomId(`${VOTE_KICK_BUTTON_PREFIX}:no:${vote.id}`)
            .setLabel(`${vote.no.size} / ${vote.required}`)
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(closed),
    );
    return {
        content: ended ? '' : vote.mentions.map((id) => `<@${id}>`).join(' '),
        embeds: [{ color: 0x5865f2, description: lines.join('\n'), footer: { text: 'فوت كيك' } }],
        components: [row],
        allowedMentions: ended ? { parse: [] } : { users: vote.mentions },
    };
}

/**
 * A ✅ (`choice` 'yes') or ❌ ('no') vote from `voter`; a member can change their vote. The vote ends when
 * either side reaches `required`: `passed` (kick) or `failed` (nobody is kicked).
 * Returns `{ ok: true, vote, passed, failed }` or `{ ok: false, reason }` with reason one of:
 * ended, not_in_channel, target, already.
 */
export function castVote(voteId, voter, choice = 'yes', now = Date.now()) {
    const vote = votes.get(voteId);
    if (!vote || vote.done || now > vote.endsAt) return { ok: false, reason: 'ended' };
    if (voter?.voice?.channelId !== vote.channelId) return { ok: false, reason: 'not_in_channel' };
    if (voter.id === vote.targetId) return { ok: false, reason: 'target' };
    const [mine, other] = choice === 'no' ? [vote.no, vote.yes] : [vote.yes, vote.no];
    if (mine.has(voter.id)) return { ok: false, reason: 'already' };
    other.delete(voter.id);
    mine.add(voter.id);
    const passed = vote.yes.size >= vote.required;
    const failed = !passed && vote.no.size >= vote.required;
    if (passed || failed) vote.done = true;
    return { ok: true, vote, passed, failed };
}

/** Ends a vote that ran out of time. Returns the vote when it was still open. */
export function expireVote(voteId) {
    const vote = votes.get(voteId);
    votes.delete(voteId);
    if (!vote || vote.done) return null;
    vote.done = true;
    return vote;
}

export function forgetVote(voteId) {
    votes.delete(voteId);
}

// Blocks: `guild:<id>:votekickblocks` = [{ channelId, userId, until }].
async function readBlocks(client, guildId) {
    const list = await client.db.get(getVoteKickBlocksKey(guildId), []);
    return Array.isArray(list) ? list : [];
}

async function writeBlocks(client, guildId, list) {
    await client.db.set(getVoteKickBlocksKey(guildId), list);
}

/** Disconnects the member and blocks them from the channel. Returns `{ disconnected, denied }`. */
export async function kickFromVoice(client, guild, channel, userId, { now = Date.now(), reason = 'فوت كيك' } = {}) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    const denied = await channel.permissionOverwrites?.edit(userId, { Connect: false }, { reason })
        .then(() => true)
        .catch((error) => {
            logger.warn(`[VOTE_KICK] Could not block ${userId} from ${channel.id}: ${error.message}`);
            return false;
        });
    let disconnected = false;
    if (member?.voice?.channelId === channel.id) {
        disconnected = await member.voice.disconnect(reason).then(() => true).catch((error) => {
            logger.warn(`[VOTE_KICK] Could not disconnect ${userId}: ${error.message}`);
            return false;
        });
    }
    const list = (await readBlocks(client, guild.id)).filter((block) => !(block.channelId === channel.id && block.userId === userId));
    list.push({ channelId: channel.id, userId, until: now + VOTE_KICK.blockMs });
    await writeBlocks(client, guild.id, list);
    return { disconnected, denied: Boolean(denied) };
}

async function liftBlock(guild, block) {
    const channel = guild.channels.cache.get(block.channelId);
    const overwrite = channel?.permissionOverwrites?.cache?.get(block.userId);
    if (!overwrite) return;
    try {
        await channel.permissionOverwrites.edit(block.userId, { Connect: null }, { reason: 'فوت كيك: خلص' });
        const after = channel.permissionOverwrites.cache.get(block.userId);
        if (after && !after.allow?.bitfield && !after.deny?.bitfield) await after.delete('فوت كيك: خلص');
    } catch (error) {
        logger.warn(`[VOTE_KICK] Could not lift the block on ${block.userId} in ${block.channelId}: ${error.message}`);
    }
}

/** Lifts blocks that ran out, or whose channel is empty or gone. Returns how many were lifted. */
export async function sweepVoteKickBlocks(client, guild, now = Date.now()) {
    if (!isHomeGuild(guild.id)) return 0;
    const list = await readBlocks(client, guild.id);
    if (!list.length) return 0;
    const keep = [];
    let lifted = 0;
    for (const block of list) {
        const channel = guild.channels.cache.get(block.channelId);
        const empty = !channel || humans(channel).length === 0;
        if (now < block.until && !empty) {
            keep.push(block);
            continue;
        }
        await liftBlock(guild, block);
        lifted += 1;
    }
    if (lifted) await writeBlocks(client, guild.id, keep);
    return lifted;
}

/**
 * voiceStateUpdate: a blocked member who joins the channel anyway is disconnected again, and a channel
 * that empties lifts its blocks. Returns true when the member was disconnected.
 */
export async function handleVoteKickVoiceState(client, oldState, newState, now = Date.now()) {
    const guild = newState.guild || oldState.guild;
    if (!guild || !isHomeGuild(guild.id)) return false;
    const left = oldState.channel && oldState.channelId !== newState.channelId ? oldState.channel : null;
    if (left && humans(left).length === 0) await sweepVoteKickBlocks(client, guild, now).catch(() => {});

    const joined = newState.channelId && newState.channelId !== oldState.channelId ? newState.channelId : null;
    if (!joined || newState.member?.user?.bot) return false;
    const blocked = (await readBlocks(client, guild.id))
        .some((block) => block.channelId === joined && block.userId === newState.id && now < block.until);
    if (!blocked) return false;
    await newState.disconnect?.('فوت كيك: مطرود من الروم ده').catch(() => {});
    return true;
}

/** Checks the blocks every minute in our server. */
export function startVoteKickSweeps(client) {
    const run = async () => {
        for (const guild of client.guilds.cache.values()) {
            await sweepVoteKickBlocks(client, guild).catch((error) => logger.error(`[VOTE_KICK] Sweep failed in ${guild.id}`, error));
        }
    };
    run();
    setInterval(run, VOTE_KICK.checkEveryMs).unref?.();
    return { status: 'started' };
}

export const VOTE_KICK_FAILURE_TEXT = {
    not_home: '❌ الأمر ده مش متاح هنا.',
    not_voice_chat: '❌ الفوت كيك بيتعمل من شات الفويس نفسه: افتح شات الروم الصوتي واكتب `فوت كيك @العضو`.',
    not_in_channel: '❌ لازم تكون جوه الروم الصوتي ده عشان تبدأ فوت كيك.',
    target_missing: '❌ منشن عضو موجود معاك في الروم الصوتي: `فوت كيك @العضو [السبب]`.',
    self: '❌ مينفعش تعمل فوت كيك لنفسك.',
    protected: '❌ مينفعش تعمل فوت كيك للعضو ده.',
    too_few: `❌ لازم يكون في الروم ${VOTE_KICK.minMembers} أعضاء على الأقل.`,
    running: '❌ في تصويت شغال في الروم ده، استنى يخلص.',
    cooldown: '⏳ استنى شوية قبل ما تبدأ تصويت تاني.',
};

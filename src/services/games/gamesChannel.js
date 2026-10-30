// gamesChannel.js — the games channel is for game commands only. Anything else posted there is
// deleted with a short notice that goes away after a few seconds. Still allowed:
//   • game and CC commands (`روليت`، `العاب`، `رصيد`، `اسعار`، `/game`...) and the panel buttons
//   • answers while a game runs there: everyone during chat games, only the players during
//     روليت / كراسي / مافيا (mafia needs its day discussion), and the player of a solo `سؤال` / `رقم`
//   • the server owners and this bot
// Other slash commands used there get a private "games only" reply.
// All of this only applies while this bot's games are on (config/games.js): with the games moved to
// the games bot the channel is left alone so that bot can run its games there.

import { getGuildConfig } from '../config/guildConfig.js';
import { getCommandPrefix } from '../../config/bot.js';
import { gamesEnabled } from '../../config/games.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { applyWordAliases, resolveCommandAlias } from '../../config/commands/commandAliases.js';
import { parseTypedCommand } from '../../utils/prefixParser.js';
import { gameAcceptsChat } from './session.js';
import { isPlayingSoloIn } from './solo.js';

export const GAMES_CHANNEL_ID = '1552714038817857556';
export const GAME_COMMANDS = new Set(['game', 'solo', 'rps', 'xo', 'fight', 'cc', 'cctop', 'bourse']);
export const GAMES_ONLY_NOTICE = '🎮 الروم ده لأوامر الألعاب بس. اكتب `العاب` عشان تشوف الألعاب.';

const NOTICE_DELETE_MS = 4_000;
const NOTICE_COOLDOWN_MS = 10_000;
const lastNotice = new Map();

/** The command a message runs (after aliases), or null when it isn't a command. */
export function typedCommandName(content, prefix) {
    const parsed = parseTypedCommand(content, prefix);
    if (!parsed) return null;
    const aliased = applyWordAliases(parsed.commandName, parsed.args, parsed.prefixed);
    return aliased ? resolveCommandAlias(aliased.commandName) : null;
}

export function isGameCommandMessage(content, prefixes) {
    return prefixes.some((prefix) => GAME_COMMANDS.has(typedCommandName(content, prefix)));
}

/** Whether `message` is in the games channel from someone the games-only rule applies to. */
export function isGamesOnlyFor(message) {
    return gamesEnabled() && message.channelId === GAMES_CHANNEL_ID && !isServerOwner(message.author?.id);
}

/** Whether a slash command must be refused in `channelId` because it isn't a game command. */
export function isBlockedSlashCommand(channelId, commandName, userId) {
    return gamesEnabled() && channelId === GAMES_CHANNEL_ID && !GAME_COMMANDS.has(commandName) && !isServerOwner(userId);
}

/** Deletes a message that doesn't belong in the games channel. Returns true when it was deleted. */
export async function handleGamesChannelMessage(message, client) {
    if (!gamesEnabled() || message.channelId !== GAMES_CHANNEL_ID || !message.guild) return false;
    const authorId = message.author?.id;
    if (authorId === message.client.user?.id || isServerOwner(authorId)) return false;

    if (!message.author?.bot && !message.webhookId) {
        if (gameAcceptsChat(message.channelId, authorId) || isPlayingSoloIn(message.channelId, authorId)) return false;
        const guildConfig = await getGuildConfig(client, message.guild.id).catch(() => null);
        const prefixes = [...new Set([guildConfig?.prefix, getCommandPrefix()].filter(Boolean))];
        if (isGameCommandMessage(message.content || '', prefixes)) return false;
    }

    await message.delete().catch(() => {});
    if (message.author?.bot || message.webhookId) return true;

    const now = Date.now();
    if (now - (lastNotice.get(authorId) || 0) < NOTICE_COOLDOWN_MS) return true;
    lastNotice.set(authorId, now);
    const notice = await message.channel.send({
        content: `<@${authorId}> ${GAMES_ONLY_NOTICE}`,
        allowedMentions: { users: [authorId] },
    }).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), NOTICE_DELETE_MS);
    return true;
}

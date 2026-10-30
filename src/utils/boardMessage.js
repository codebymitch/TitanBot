import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';

// Guild config key holding { [boardKey]: messageId } so a restart edits the same post instead of reposting.
const CONFIG_KEY = 'boardMessageIds';

async function readStoredId(channel, key) {
  const config = await getGuildConfig(channel.client, channel.guild.id).catch(() => null);
  return config?.[CONFIG_KEY]?.[key] || null;
}

/** Saves the board's message ID in the guild config; failures only mean the next run falls back to scanning. */
export async function rememberBoardMessage(channel, key, messageId) {
  const config = await getGuildConfig(channel.client, channel.guild.id).catch(() => null);
  if (!config || config[CONFIG_KEY]?.[key] === messageId) return;
  await updateGuildConfig(channel.client, channel.guild.id, {
    [CONFIG_KEY]: { ...(config[CONFIG_KEY] || {}), [key]: messageId },
  }).catch(() => {});
}

/**
 * Finds this bot's board message so it can be edited in place.
 * The saved message ID is tried first, so the board is found however far up the channel it is;
 * otherwise the channel's recent messages are searched. When earlier runs left several copies,
 * the saved (or oldest) one is kept and the extra copies are deleted.
 */
export async function findBoardMessage(channel, key, isBoardMessage) {
  const isOwnBoard = (message) => message.author?.id === channel.client.user.id && isBoardMessage(message);

  const storedId = await readStoredId(channel, key);
  const stored = storedId ? await channel.messages.fetch(storedId).catch(() => null) : null;

  const recentMessages = await channel.messages.fetch({ limit: 100 });
  const boards = [...recentMessages.values()]
    .filter(isOwnBoard)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const board = stored && isOwnBoard(stored) ? stored : boards[0] || null;
  const duplicates = boards.filter((message) => message.id !== board?.id);
  await Promise.all(duplicates.map((message) => message.delete().catch(() => {})));

  if (board) await rememberBoardMessage(channel, key, board.id);
  return board;
}

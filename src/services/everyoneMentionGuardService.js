import { isServerOwner } from '../config/serverOwners.js';
import { canLiftHardBan } from './moderation/hardBanService.js';

// Only owners, trusted members and this bot (e.g. the rules post) may mention @everyone / @here.
// Anyone else has the message deleted and gets a short notice (gone after 1 second).
const EVERYONE_MENTION = /@(?:everyone|here)\b/u;
const BLOCKED_NOTICE_DELETE_MS = 1_000;

async function canMentionEveryone(message) {
  if (message.author.id === message.client?.user?.id) return true;
  if (isServerOwner(message.author.id)) return true;
  return canLiftHardBan(message.guild, message.author.id);
}

/** Returns true when the message was deleted for mentioning @everyone / @here. */
export async function handleEveryoneMention(message) {
  if (!message.mentions?.everyone && !EVERYONE_MENTION.test(message.content || '')) return false;
  if (await canMentionEveryone(message)) return false;

  await message.delete().catch(() => {});
  const notice = await message.channel.send({
    content: `🚫 <@${message.author.id}> منشن everyone للـ trusted بس.`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS);
  return true;
}

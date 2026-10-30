import { isServerOwner } from '../config/serverOwners.js';
import { canLiftHardBan } from './moderation/hardBanService.js';

// Image-only channel: every message there needs at least one image (text with the image is fine).
// Anything else is deleted and the author gets a short notice (gone after 1 second).
// Owners and trusted members may write normally.
export const IMAGE_ONLY_CHANNEL_ID = '1547310561505837277';
const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|heic|heif|avif|tiff?)$/iu;
const BLOCKED_NOTICE_DELETE_MS = 1_000;

function isImageAttachment(attachment) {
  if (attachment?.contentType) return attachment.contentType.startsWith('image/');
  return IMAGE_EXTENSION.test(attachment?.name || '');
}

export function hasImage(message) {
  return [...(message.attachments?.values() || [])].some(isImageAttachment);
}

async function canWriteWithoutImage(message) {
  if (isServerOwner(message.author.id)) return true;
  return canLiftHardBan(message.guild, message.author.id);
}

/** Returns true when the message was deleted for having no image in the image-only channel. */
export async function handleImageOnlyChannelMessage(message) {
  if (message.channelId !== IMAGE_ONLY_CHANNEL_ID || !message.guild) return false;
  if (hasImage(message)) return false;
  if (await canWriteWithoutImage(message)) return false;

  await message.delete().catch(() => {});
  const notice = await message.channel.send({
    content: `🚫 <@${message.author.id}> الروم دي للصور بس، ابعت صورة (ومعاها كلام لو حابب).`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS);
  return true;
}

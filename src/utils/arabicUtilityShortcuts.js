import { PermissionFlagsBits } from 'discord.js';
import { scheduleNoPermissionDelete } from './noPermissionReply.js';

const COMMANDS = new Set(['ق', 'ف', 'نك', 'font']);
const NO_PERMISSION = '🚫 No Permission';
const BOLD_UPPER_START = 0x1d400;
const BOLD_LOWER_START = 0x1d41a;
const BOLD_DIGIT_START = 0x1d7ce;

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission) || member?.guild?.ownerId === member?.id);
}

async function reply(message, content) {
  await message.channel.send({ content, allowedMentions: { parse: [] } }).then(scheduleNoPermissionDelete).catch(() => {});
  return true;
}

function parseCommand(content) {
  const parts = String(content || '').trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return null;
  const command = parts[0].toLowerCase();
  if (!COMMANDS.has(command)) return null;
  return { command, tail: parts.slice(1).join(' ') };
}

function toBoldFont(value) {
  return [...String(value)].map((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0x41 && codePoint <= 0x5a) return String.fromCodePoint(BOLD_UPPER_START + codePoint - 0x41);
    if (codePoint >= 0x61 && codePoint <= 0x7a) return String.fromCodePoint(BOLD_LOWER_START + codePoint - 0x61);
    if (codePoint >= 0x30 && codePoint <= 0x39) return String.fromCodePoint(BOLD_DIGIT_START + codePoint - 0x30);
    return character;
  }).join('');
}

async function lockChannel(message, locked) {
  if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) return reply(message, NO_PERMISSION);
  const channel = message.channel;
  if (!channel?.isTextBased?.() || !channel.permissionOverwrites?.edit) return reply(message, '❌ Text Channels Only');
  try {
    const everyoneRole = message.guild.roles.everyone;
    const currentPermissions = channel.permissionsFor(everyoneRole);
    const alreadyLocked = currentPermissions?.has(PermissionFlagsBits.SendMessages) === false;
    if (locked === alreadyLocked) return reply(message, locked ? `ℹ️ ${channel} Already Locked` : `ℹ️ ${channel} Already Unlocked`);
    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: !locked }, { reason: `${locked ? 'Channel locked' : 'Channel unlocked'} by ${message.author.tag}` });
    return reply(message, locked ? `🔒 ${channel} Locked` : `🔓 ${channel} Unlocked`);
  } catch (error) {
    return reply(message, `❌ ${error.message}`);
  }
}

async function getReplyMember(message) {
  if (!message.reference?.messageId) return null;
  const referencedMessage = await message.fetchReference().catch(() => null);
  if (!referencedMessage?.author?.id) return null;
  return message.guild.members.fetch(referencedMessage.author.id).catch(() => null);
}

async function changeNickname(message, tail) {
  if (!hasPermission(message.member, PermissionFlagsBits.ManageNicknames)) return reply(message, NO_PERMISSION);

  const mention = tail.match(/^<@!?(\d+)>\s*/u);
  const targetId = mention?.[1] || null;
  const nickname = (mention ? tail.slice(mention[0].length) : tail).trim();
  const targetMember = targetId
    ? await message.guild.members.fetch(targetId).catch(() => null)
    : await getReplyMember(message) || message.member;
  if (!targetMember) return reply(message, '❌ Member Not Found');

  const restoreOriginalName = !nickname;
  if (nickname.length > 32) return reply(message, '❌ Max 32 Characters');

  // Manage Nicknames allows targeting members regardless of the requester's
  // role position. Discord still requires the bot's highest role to be above
  // the target member because this is enforced by Discord itself.
  const botMember = message.guild.members.me;
  if (targetMember.id !== message.member.id && botMember
    && targetMember.roles.highest.position >= botMember.roles.highest.position) {
    return reply(message, '❌ Member Role Is Higher Than Mine');
  }

  try {
    await targetMember.setNickname(restoreOriginalName ? null : nickname, `Nickname ${restoreOriginalName ? 'restored' : 'changed'} by ${message.author.tag}`);
    return reply(message, restoreOriginalName
      ? `↩️ ${targetMember} Nickname Reset`
      : `✏️ ${targetMember} Nickname Changed`);
  } catch (error) {
    return reply(message, `❌ ${error.message}`);
  }
}

export async function handleArabicUtilityShortcuts(message) {
  const parsed = parseCommand(message.content);
  if (!parsed) return false;
  if (parsed.command === 'ق') return lockChannel(message, true);
  if (parsed.command === 'ف') return lockChannel(message, false);
  if (parsed.command === 'نك') return changeNickname(message, parsed.tail);
  if (!parsed.tail) return reply(message, '⚠️ font text');
  return reply(message, toBoldFont(parsed.tail));
}

export { toBoldFont };

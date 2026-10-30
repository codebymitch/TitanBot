import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { openReportIssue } from './reportIssueService.js';
import { isServerOwner } from '../config/serverOwners.js';
import { isHomeGuild } from '../config/homeGuild.js';

// Any message posted in this channel is turned into a report; no command needed.
// `/report file` sends its reports here as well.
export const REPORT_CHANNEL_ID = '1552304815713943602';

const REPORT_COLOR = 0xe74c3c;
const MAX_DESCRIPTION_LENGTH = 4000;

function buildReportEmbed({ reporter, content, reportedUser, sourceChannel }) {
  const lines = [
    `**المُبلِّغ:** ${reporter} (${reporter.tag} - ${reporter.id})`,
  ];
  if (reportedUser) lines.push(`**المُبلَّغ عنه:** ${reportedUser} (${reportedUser.tag} - ${reportedUser.id})`);
  if (sourceChannel) lines.push(`**الروم:** ${sourceChannel}`);
  lines.push(`**الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`);

  const body = content?.trim() || '*(بدون نص)*';
  return {
    color: REPORT_COLOR,
    title: '📩 بلاغ جديد',
    author: { name: reporter.tag, icon_url: reporter.displayAvatarURL() },
    description: `${lines.join('\n')}\n\n**المشكلة:**\n${body}`.slice(0, MAX_DESCRIPTION_LENGTH),
  };
}

// Saves the posted report as a GitHub issue and shows its number on the report.
async function recordReport(reportMessage, details) {
  const attachmentUrls = [...reportMessage.attachments.values()].map((attachment) => attachment.url);
  const number = await openReportIssue({ reportMessage, attachmentUrls, ...details });
  if (!number) return;
  const [embed] = reportMessage.embeds;
  await reportMessage.edit({ embeds: [{ ...embed?.toJSON?.(), title: `📩 بلاغ #${number}` }] }).catch(() => null);
}

async function fetchReportChannel(guild) {
  const channel = guild.channels.cache.get(REPORT_CHANNEL_ID)
    || await guild.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

// Owners who asked not to be pinged on new reports.
const NO_PING_USER_IDS = ['1159601661392715906'];

function ownerPing(guild) {
  return guild.ownerId && !NO_PING_USER_IDS.includes(guild.ownerId)
    ? { content: `<@${guild.ownerId}> بلاغ جديد!`, allowedMentions: { users: [guild.ownerId] } }
    : { content: 'بلاغ جديد!', allowedMentions: { parse: [] } };
}

// `/report file`: posts the report in the report channel. Returns false if the channel is unavailable.
export async function sendReport(guild, { reporter, reportedUser, reason, sourceChannel }) {
  const channel = await fetchReportChannel(guild);
  if (!channel) {
    logger.warn(`Report channel ${REPORT_CHANNEL_ID} was not found in guild ${guild.id}.`);
    return false;
  }
  const posted = await channel.send({
    ...ownerPing(guild),
    embeds: [buildReportEmbed({ reporter, content: reason, reportedUser, sourceChannel })],
  });
  await recordReport(posted, { reporter, reportedUser, content: reason, sourceChannel });
  return true;
}

// Owners and staff (Manage Messages) can run commands here, e.g. `say` to post an announcement;
// for anyone else every message is a report, even one that starts with a command word.
function canRunCommandsHere(message) {
  if (isServerOwner(message.author.id) || message.guild.ownerId === message.author.id) return true;
  return Boolean(message.member?.permissionsIn?.(message.channel)?.has(PermissionFlagsBits.ManageMessages));
}

// In our server only these may write in the report channel (report #222): the owners, the member below
// and whoever has the PSYCHO role. Anyone else's message (a reply too) is deleted with a short notice;
// members still report with `/report`, which the bot posts here itself.
export const REPORT_WRITER_IDS = new Set(['1270702393612570665']);
const REPORT_WRITER_ROLE = /psycho/iu;
const BLOCKED_NOTICE_DELETE_MS = 5_000;

export function canWriteInReports(message) {
  if (!isHomeGuild(message.guild?.id)) return true;
  const authorId = message.author?.id;
  if (isServerOwner(authorId) || message.guild.ownerId === authorId || REPORT_WRITER_IDS.has(authorId)) return true;
  return [...(message.member?.roles?.cache?.values?.() || [])].some((role) => REPORT_WRITER_ROLE.test(role.name || ''));
}

// Turns a plain message in the report channel into a report embed and removes the original.
// Replies are left alone so staff and the reporter can talk under a report.
// `isCommand(message)` tells whether the message is a bot command; staff commands run instead of becoming reports.
// Returns true when the message belonged to the report channel (handled), false otherwise.
export async function handleReportChannelMessage(message, { isCommand = async () => false } = {}) {
  if (message.channelId !== REPORT_CHANNEL_ID) return false;
  if (!canWriteInReports(message)) {
    await message.delete().catch(() => null);
    const notice = await message.channel.send({
      content: `🚫 <@${message.author.id}> الروم ده مش للكتابة، لو عندك بلاغ استخدم \`/report\`.`,
      allowedMentions: { users: [message.author.id] },
    }).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS).unref?.();
    return true;
  }
  if (message.reference?.messageId) return true;
  if (canRunCommandsHere(message) && await isCommand(message)) return false;

  const permissions = message.guild.members.me ? message.channel.permissionsFor(message.guild.members.me) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    logger.warn(`Bot lacks View Channel, Send Messages or Embed Links in report channel ${REPORT_CHANNEL_ID}.`);
    return true;
  }

  const embed = buildReportEmbed({ reporter: message.author, content: message.content });
  const files = [...message.attachments.values()].map((attachment) => ({ attachment: attachment.url, name: attachment.name }));

  let posted;
  try {
    posted = await message.channel.send({ ...ownerPing(message.guild), embeds: [embed], files });
  } catch (error) {
    // Attachments can exceed the bot's upload limit: post the report without them and keep the original.
    logger.error(`Failed to post report from ${message.author.tag} with attachments:`, error);
    const fallback = await message.channel.send({ ...ownerPing(message.guild), embeds: [embed] }).catch((fallbackError) => {
      logger.error(`Failed to post report from ${message.author.tag}:`, fallbackError);
      return null;
    });
    if (fallback) await recordReport(fallback, { reporter: message.author, content: `${message.content}\n\n(المرفقات في الرسالة الأصلية: ${message.url})` });
    return true;
  }

  if (permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.delete().catch(() => null);
  }
  await recordReport(posted, { reporter: message.author, content: message.content });
  logger.info(`Report registered from ${message.author.tag} (${message.author.id}) in guild ${message.guild.id}.`);
  return true;
}

import { AuditLogEvent, Events } from 'discord.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { sendAntiNukeLog } from './antiNukeLogging.js';
import { isServerOwner } from '../config/serverOwners.js';


async function getBotAddExecutor(guild, botId) {
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 }).catch(() => null);
  return logs?.entries.find((entry) => (
    entry.target?.id === botId && Date.now() - entry.createdTimestamp < 30_000
  )) || null;
}

function isExplicitlyTrusted(config, member) {
  if (!member) return false;
  return isServerOwner(member.id)
    || config?.antiNukeTrustedUsers?.includes(member.id) === true;
}

export async function handleUntrustedBotJoin(member) {
  if (!member?.guild || !member.user?.bot) return false;
  if (member.id === member.guild.client.user?.id) return false;

  const config = await getGuildConfig(member.client, member.guild.id).catch(() => null);
  const entry = await getBotAddExecutor(member.guild, member.id);
  const inviter = entry?.executor
    ? await member.guild.members.fetch(entry.executor.id).catch(() => null)
    : null;

  // A role named Owner is not trusted automatically. Only the bot owner or an
  // explicitly trusted user may invite bots without enforcement.
  const trusted = isExplicitlyTrusted(config, inviter);
  if (trusted) return false;

  const botRemoved = member.kickable
    ? await member.kick('Anti-Raid: untrusted bot added').then(() => true).catch(() => false)
    : false;
  const inviterRemoved = inviter?.kickable
    ? await inviter.kick('Anti-Raid: invited an untrusted bot').then(() => true).catch(() => false)
    : false;

  await sendAntiNukeLog(member.guild, {
    action: 'Untrusted bot blocked',
    target: `${member.user.tag} (${member.id})`,
    executor: inviter?.user || member.user,
    punishment: inviterRemoved ? 'تم طرده' : 'فشل طرده — يحتاج تدخل يدوي',
    reason: `أضاف بوت غير موثوق <@${member.id}>${botRemoved ? ' وتم طرد البوت' : ''}`,
  });

  return botRemoved || inviterRemoved;
}

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await handleUntrustedBotJoin(member);
  },
};

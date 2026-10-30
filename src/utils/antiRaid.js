import { Events, PermissionFlagsBits } from 'discord.js';
import { inspectAuditAction, findRecentAuditEntry, sendAntiNukeLog, isTrusted, AuditLogEvent } from './antiNukeLogging.js';
import { getGuildConfig } from '../services/config/guildConfig.js';

export async function inspectChannelDelete(channel) {
  return inspectAuditAction(channel?.guild, 'channelDelete', channel?.id);
}

export async function inspectRoleDelete(role) {
  return inspectAuditAction(role?.guild, 'roleDelete', role?.id);
}

export async function inspectRoleUpdate(role) {
  return inspectAuditAction(role?.guild, 'permissionUpdate', role?.id);
}

export async function inspectMessageDelete(channel) {
  return inspectAuditAction(channel?.guild, 'bulkDelete', channel?.id);
}

export async function inspectRoleCreate(role) {
  return inspectAuditAction(role?.guild, 'roleCreate', role?.id);
}

/** Anyone who gives a member an Administrator role is kicked together with that member, unless trusted. */
export async function inspectAdminRoleGrant(oldMember, newMember) {
  const guild = newMember?.guild;
  if (!guild || newMember.id === guild.client.user?.id) return false;
  const adminRoles = newMember.roles.cache.filter((role) => (
    !oldMember.roles?.cache?.has(role.id) && !role.managed && role.permissions.has(PermissionFlagsBits.Administrator)
  ));
  if (!adminRoles.size) return false;

  const grantsAdmin = (item) => item.changes?.some((change) => (
    change.key === '$add' && change.new?.some((role) => adminRoles.has(role.id))
  ));
  // The audit entry can lag behind the gateway event, so look once more before giving up.
  const entry = await findRecentAuditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, grantsAdmin)
    || await new Promise((resolve) => setTimeout(resolve, 1500))
      .then(() => findRecentAuditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, grantsAdmin));
  const executorId = entry?.executor?.id;
  if (!executorId) return false;
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  if (await isTrusted(guild, config, executorId)) return false;

  const reason = 'Anti-Nuke: Administrator role given by an untrusted member';
  const executor = await guild.members.fetch(executorId).catch(() => null);
  const receiverKicked = newMember.kickable ? await newMember.kick(reason).then(() => true).catch(() => false) : false;
  const executorKicked = executor?.kickable ? await executor.kick(reason).then(() => true).catch(() => false) : false;

  await sendAntiNukeLog(guild, {
    action: 'Administrator role given',
    target: `${newMember.user.tag} (${newMember.id})`,
    executor: entry.executor,
    punishment: executorKicked ? 'تم طرده' : 'فشل طرده — يحتاج تدخل يدوي',
    reason: `أعطى رتبة Administrator (${adminRoles.map((role) => role.name).join(', ')}) لـ <@${newMember.id}>${receiverKicked ? ' وتم طرده هو كمان' : ''}`,
  });
  return receiverKicked || executorKicked;
}

export async function inspectMemberRemoval(member, event = Events.GuildMemberRemove) {
  const action = event === Events.GuildBanAdd ? 'memberBan' : 'memberKick';
  return inspectAuditAction(member?.guild, action, member?.id);
}

export async function handleAntiRaidCommand(message) {
  if (!message?.guild || message.author?.bot) return false;
  return false;
}

export { findRecentAuditEntry, sendAntiNukeLog, AuditLogEvent };

export default { name: Events.MessageCreate, async execute() {} };

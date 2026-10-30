import { getGuildConfig } from '../services/config/guildConfig.js';
import { isServerOwner } from '../config/serverOwners.js';


async function reply(message, content) {
  await message.channel.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}

/** Lists the Anti-Nuke trusted members, bots and roles for the current guild. */
export async function handleTrustedListCommand(message, client) {
  if (!isServerOwner(message.author.id)) return reply(message, '🚫 Owner Only');

  const config = await getGuildConfig(client, message.guild.id);
  const trustedUserIds = Array.isArray(config?.antiNukeTrustedUsers) ? config.antiNukeTrustedUsers : [];
  const trustedRoleIds = Array.isArray(config?.antiNukeTrustedRoles) ? config.antiNukeTrustedRoles : [];

  const users = [];
  const bots = [];
  for (const userId of [...new Set(trustedUserIds)]) {
    const member = await message.guild.members.fetch(userId).catch(() => null);
    const user = member?.user || await client.users.fetch(userId).catch(() => null);
    const entry = `<@${userId}>`;
    if (user?.bot) bots.push(entry);
    else users.push(entry);
  }

  const roles = [];
  for (const roleId of [...new Set(trustedRoleIds)]) {
    const role = await message.guild.roles.fetch(roleId).catch(() => null);
    roles.push(`<@&${role?.id || roleId}>`);
  }

  const parts = [];
  if (users.length) parts.push(`👤 ${users.join(' ')}`);
  if (bots.length) parts.push(`🤖 ${bots.join(' ')}`);
  if (roles.length) parts.push(`🎭 ${roles.join(' ')}`);
  return reply(message, parts.length ? `🛡️ Trusted: ${parts.join(' | ')}` : '🛡️ No Trusted Members');
}

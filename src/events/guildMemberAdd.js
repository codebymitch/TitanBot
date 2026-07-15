import { Events } from 'discord.js';
import { getConfig } from '../modules/community/store.js';
import { createEmbed } from '../utils/embeds.js';
export default { name: Events.GuildMemberAdd, async execute(member) {
  const config = await getConfig(member.client, member.guild.id);
  if (!config.welcome.enabled) return;
  const channel = member.guild.channels.cache.get(config.welcome.channelId);
  if (!channel?.isTextBased()) return;
  const description = config.welcome.message.replaceAll('{user}', `<@${member.id}>`).replaceAll('{server}', member.guild.name).replaceAll('{memberCount}', String(member.guild.memberCount));
  await channel.send({ embeds: [createEmbed({ title: 'ברוכים הבאים!', description, color: 'success' })] });
} };

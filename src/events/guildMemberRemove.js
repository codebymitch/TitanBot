import { Events } from 'discord.js';
import { getConfig } from '../modules/community/store.js';
import { createEmbed } from '../utils/embeds.js';
export default { name: Events.GuildMemberRemove, async execute(member) {
  const c = await getConfig(member.client, member.guild.id); const channel = member.guild.channels.cache.get(c.logging.channelId);
  if (c.logging.enabled && channel?.isTextBased()) await channel.send({ embeds: [createEmbed({ title: 'חבר עזב', description: `${member.user.tag} עזב את השרת.`, color: 'warning' })] });
} };

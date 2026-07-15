import { Events } from 'discord.js';
import { getConfig, levelKey } from '../modules/community/store.js';
import { createEmbed } from '../utils/embeds.js';
export default { name: Events.MessageCreate, async execute(message) {
  if (!message.guild || message.author.bot) return;
  const c = await getConfig(message.client, message.guild.id);
  if (c.logging.enabled && c.logging.channelId && message.channel.id !== c.logging.channelId) {
    const channel = message.guild.channels.cache.get(c.logging.channelId);
    if (channel?.isTextBased()) await channel.send({ embeds: [createEmbed({ title: 'הודעה חדשה', description: `נשלחה הודעה ב-${message.channel}: ${message.author}`, color: 'info' })] }).catch(() => {});
  }
  if (!c.leveling.enabled || !message.content.trim()) return;
  const id = levelKey(message.guild.id, message.author.id); const user = await message.client.db.get(id, { xp: 0, level: 0, last: 0 });
  if (Date.now() - user.last < c.leveling.cooldownMs) return;
  const xp = c.leveling.xpMin + Math.floor(Math.random() * (c.leveling.xpMax - c.leveling.xpMin + 1));
  user.xp += xp; user.last = Date.now(); const level = Math.floor(Math.sqrt(user.xp / 100));
  const changed = level > user.level; user.level = level; await message.client.db.set(id, user);
  if (changed) { const channel = message.guild.channels.cache.get(c.leveling.announceChannelId) || message.channel; await channel.send({ embeds: [createEmbed({ title: 'עלית רמה!', description: `${message.author}, הגעת לרמה **${level}**.`, color: 'success' })] }); }
} };

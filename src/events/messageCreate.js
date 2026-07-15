import { Events } from 'discord.js';
import { getConfig, levelKey } from '../modules/community/store.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { createEmbed } from '../utils/embeds.js';

export default { name: Events.MessageCreate, async execute(message) {
  if (!message.guild || message.author.bot || message.webhookId) return;
  const config = await getConfig(message.client, message.guild.id);
  if (config.logging.enabled && config.logging.channelId !== message.channelId && config.logging.enabledEvents?.[EVENT_TYPES.MESSAGE_CREATE] !== false) {
    await logEvent({ client: message.client, guildId: message.guild.id, eventType: EVENT_TYPES.MESSAGE_CREATE, data: { title: '💬 הודעה חדשה', userId: message.author.id, channelId: message.channelId, description: message.content || 'ללא תוכן טקסטואלי', fields: [{ name: 'מחבר', value: `${message.author} (\`${message.author.id}\`)` }, { name: 'ערוץ', value: `${message.channel}`, inline: true }, { name: 'מזהה הודעה', value: `\`${message.id}\``, inline: true }, { name: 'קבצים מצורפים', value: message.attachments.size ? message.attachments.map(a => a.url).join('\n') : 'ללא' }] } });
  }
  if (!config.leveling.enabled || !message.content.trim()) return;
  const id = levelKey(message.guild.id, message.author.id), user = await message.client.db.get(id, { xp: 0, level: 0, last: 0 });
  if (Date.now() - user.last < config.leveling.cooldownMs) return;
  user.xp += config.leveling.xpMin + Math.floor(Math.random() * (config.leveling.xpMax - config.leveling.xpMin + 1)); user.last = Date.now();
  const level = Math.floor(Math.sqrt(user.xp / 100)), changed = level > user.level; user.level = level; await message.client.db.set(id, user);
  if (changed) { const channel = message.guild.channels.cache.get(config.leveling.announceChannelId) || message.channel; await channel.send({ embeds: [createEmbed({ title: 'עלית רמה!', description: `${message.author}, הגעת לרמה **${level}**.`, color: 'success' })] }); }
} };

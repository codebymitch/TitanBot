import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.MessageDelete, async execute(message) {
  if (!message.guild || message.author?.bot) return;
  await logEvent({ client: message.client, guildId: message.guild.id, eventType: EVENT_TYPES.MESSAGE_DELETE, data: { title: 'הודעה נמחקה', description: message.content || 'תוכן ההודעה אינו זמין.', userId: message.author?.id, channelId: message.channelId, fields: [{ name: 'משתמש', value: message.author ? `${message.author} (\`${message.author.id}\`)` : 'לא ידוע', inline: true }, { name: 'ערוץ', value: `<#${message.channelId}>`, inline: true }] } });
} };

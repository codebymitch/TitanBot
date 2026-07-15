import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.MessageUpdate, async execute(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot || oldMessage.content === newMessage.content) return;
  await logEvent({ client: newMessage.client, guildId: newMessage.guild.id, eventType: EVENT_TYPES.MESSAGE_EDIT, data: { title: 'הודעה נערכה', userId: newMessage.author?.id, channelId: newMessage.channelId, description: `[מעבר להודעה](${newMessage.url})`, fields: [{ name: 'לפני', value: oldMessage.content || '—' }, { name: 'אחרי', value: newMessage.content || '—' }, { name: 'ערוץ', value: `<#${newMessage.channelId}>`, inline: true }] } });
} };

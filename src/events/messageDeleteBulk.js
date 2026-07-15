import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.MessageBulkDelete, async execute(messages, channel) { if (channel.guild) await logEvent({ client: channel.client, guildId: channel.guild.id, eventType: EVENT_TYPES.MESSAGE_BULK_DELETE, data: { title: 'מחיקת הודעות', description: `נמחקו **${messages.size}** הודעות.`, channelId: channel.id, fields: [{ name: 'ערוץ', value: `${channel}` }] } }); } };

import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.GuildBanAdd, async execute(ban) { await logEvent({ client: ban.client, guildId: ban.guild.id, eventType: EVENT_TYPES.MODERATION_BAN, data: { title: 'משתמש נחסם', description: `${ban.user.tag} נחסם מהשרת.`, userId: ban.user.id, fields: [{ name: 'משתמש', value: `${ban.user} (\`${ban.user.id}\`)` }, { name: 'סיבה', value: ban.reason || 'לא צוינה' }] } }); } };

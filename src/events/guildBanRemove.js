import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.GuildBanRemove, async execute(ban) { await logEvent({ client: ban.client, guildId: ban.guild.id, eventType: EVENT_TYPES.MODERATION_UNBAN, data: { title: 'חסימה הוסרה', description: `החסימה של ${ban.user.tag} הוסרה.`, userId: ban.user.id } }); } };

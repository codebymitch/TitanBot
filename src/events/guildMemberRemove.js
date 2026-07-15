import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.GuildMemberRemove, async execute(member) {
  await logEvent({ client: member.client, guildId: member.guild.id, eventType: EVENT_TYPES.MEMBER_LEAVE, data: { title: 'חבר עזב', description: `${member.user.tag} עזב את השרת.`, userId: member.id, fields: [{ name: 'משתמש', value: `${member.user.tag} (\`${member.id}\`)` }] } });
} };

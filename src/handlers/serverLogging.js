import { AuditLogEvent, Events } from 'discord.js';
import { findAuditEntry, auditActor } from '../services/auditLogService.js';
import { EVENT_TYPES, logEvent } from '../services/loggingService.js';
import { getConfig } from '../modules/community/store.js';
import { logger } from '../utils/logger.js';

const seen = new Map();
const oldUnavailable = 'התוכן המקורי לא היה זמין במטמון.';
const deletedUnavailable = 'ההודעה נמחקה, אך התוכן שלה לא היה זמין במטמון.';
const value = v => v === null || v === undefined || v === '' ? '—' : String(v);
const channelRef = id => id ? `<#${id}>` : 'לא ידוע';
const actor = entry => ({ name: 'מבצע הפעולה', value: auditActor(entry), inline: true });

function duplicate(key) {
  const now = Date.now();
  for (const [id, expiry] of seen) if (expiry <= now) seen.delete(id);
  if (seen.has(key)) return true;
  seen.set(key, now + 10_000);
  return false;
}
async function emit(guild, eventType, data) {
  if (!guild) return;
  const config = await getConfig(guild.client, guild.id);
  if (!config.logging?.enabled || !config.logging.channelId || data.channelId === config.logging.channelId || config.logging.enabledEvents?.[eventType] === false) return;
  await logEvent({ client: guild.client, guildId: guild.id, eventType, data });
}
const ignoredMessage = m => !m?.guild || m.author?.bot || Boolean(m.webhookId);
const listen = (client, event, fn) => client.on(event, (...args) => Promise.resolve(fn(...args)).catch(error => logger.error(`Logging event ${event} failed`, error)));

async function edited(oldMessage, newMessage, raw = false) {
  const m = newMessage || oldMessage;
  if (ignoredMessage(m) || (!raw && oldMessage.content === newMessage.content) || duplicate(`edit:${m.guildId}:${m.id}:${m.editedTimestamp || m.content}`)) return;
  await emit(m.guild, EVENT_TYPES.MESSAGE_EDIT, { title: '✏️ הודעה נערכה', userId: m.author?.id, channelId: m.channelId, description: m.url ? `[מעבר להודעה](${m.url})` : undefined, fields: [{ name: 'מחבר', value: m.author ? `${m.author} (\`${m.author.id}\`)` : 'לא ידוע' }, { name: 'ערוץ', value: channelRef(m.channelId), inline: true }, { name: 'תוכן מקורי', value: raw || oldMessage.partial ? oldUnavailable : value(oldMessage.content) }, { name: 'תוכן חדש', value: value(m.content) }] });
}
async function removed(m, raw = false) {
  if (ignoredMessage(m) || duplicate(`delete:${m.guildId}:${m.id}`)) return;
  await emit(m.guild, EVENT_TYPES.MESSAGE_DELETE, { title: '🗑️ הודעה נמחקה', userId: m.author?.id, channelId: m.channelId, description: raw || m.partial ? deletedUnavailable : value(m.content), fields: [{ name: 'מחבר', value: m.author ? `${m.author} (\`${m.author.id}\`)` : 'לא ידוע' }, { name: 'ערוץ', value: channelRef(m.channelId), inline: true }, { name: 'מזהה הודעה', value: `\`${m.id}\``, inline: true }, { name: 'קבצים מצורפים', value: !raw && m.attachments?.size ? m.attachments.map(a => a.url).join('\n') : 'ללא / לא זמין' }] });
}

export default function registerServerLogging(client) {
  if (client.__serverLoggingRegistered) return;
  client.__serverLoggingRegistered = true;
  listen(client, Events.MessageUpdate, edited);
  listen(client, Events.MessageDelete, removed);
  listen(client, Events.MessageBulkDelete, async (messages, channel) => {
    if (!channel.guild || duplicate(`bulk:${channel.id}:${[...messages.keys()].sort()}`)) return;
    const entry = await findAuditEntry(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id);
    const known = messages.filter(m => m.content).first(10).map(m => `${m.author?.tag || 'לא ידוע'}: ${m.content}`).join('\n') || deletedUnavailable;
    await emit(channel.guild, EVENT_TYPES.MESSAGE_BULK_DELETE, { title: '🗑️ מחיקת הודעות מרובה', channelId: channel.id, fields: [{ name: 'ערוץ', value: `${channel}` }, { name: 'כמות', value: String(messages.size), inline: true }, actor(entry), { name: 'תוכן ידוע', value: known }] });
  });
  listen(client, Events.Raw, async packet => {
    if (!packet.d?.guild_id || !['MESSAGE_UPDATE', 'MESSAGE_DELETE'].includes(packet.t)) return;
    const guild = client.guilds.cache.get(packet.d.guild_id), channel = guild?.channels.cache.get(packet.d.channel_id);
    if (!guild || !channel || channel.messages?.cache?.has(packet.d.id)) return;
    const m = { id: packet.d.id, guild, guildId: guild.id, channelId: channel.id, client, content: packet.d.content, author: packet.d.author, webhookId: packet.d.webhook_id, partial: true, editedTimestamp: packet.d.edited_timestamp, url: `https://discord.com/channels/${guild.id}/${channel.id}/${packet.d.id}` };
    if (packet.t === 'MESSAGE_UPDATE' && Object.hasOwn(packet.d, 'content')) await edited(m, m, true);
    if (packet.t === 'MESSAGE_DELETE') await removed(m, true);
  });

  listen(client, Events.GuildMemberAdd, async member => { const days = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000); await emit(member.guild, EVENT_TYPES.MEMBER_JOIN, { title: '📥 חבר הצטרף לשרת', userId: member.id, fields: [{ name: 'חבר', value: `${member} (${member.user.tag})` }, { name: 'יצירת החשבון', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` }, { name: 'גיל החשבון', value: `${days} ימים`, inline: true }, { name: 'חשבון חדש מ-7 ימים', value: days < 7 ? 'כן' : 'לא', inline: true }, { name: 'מספר חברים', value: String(member.guild.memberCount), inline: true }] }); });
  listen(client, Events.GuildMemberRemove, async member => {
    const kick = await findAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id, { delayMs: 1200, maxAgeMs: 12_000 });
    const memberRoles = member.roles?.cache?.filter(r => r.id !== member.guild.id && !r.managed).map(String).join(', ') || 'ללא';
    await emit(member.guild, kick ? EVENT_TYPES.MODERATION_KICK : EVENT_TYPES.MEMBER_LEAVE, { title: kick ? '👢 חבר הוסר מהשרת' : '📤 חבר עזב את השרת', userId: member.id, fields: [{ name: 'משתמש', value: `${member.user.tag} (\`${member.id}\`)` }, { name: 'תאריך הצטרפות', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'לא זמין' }, { name: 'תפקידים', value: memberRoles }, { name: 'מספר חברים', value: String(member.guild.memberCount), inline: true }, ...(kick ? [actor(kick), { name: 'סיבה', value: kick.reason || 'לא צוינה' }] : [])] });
  });
  listen(client, Events.GuildMemberUpdate, async (before, after) => {
    const fields = [];
    if (before.nickname !== after.nickname) fields.push({ name: 'כינוי', value: `${value(before.nickname)} → ${value(after.nickname)}` });
    const added = after.roles.cache.filter(r => !before.roles.cache.has(r.id) && !r.managed), gone = before.roles.cache.filter(r => !after.roles.cache.has(r.id) && !r.managed);
    if (added.size) fields.push({ name: 'תפקידים שנוספו', value: added.map(String).join(', ') });
    if (gone.size) fields.push({ name: 'תפקידים שהוסרו', value: gone.map(String).join(', ') });
    if (before.communicationDisabledUntilTimestamp !== after.communicationDisabledUntilTimestamp) { const entry = await findAuditEntry(after.guild, AuditLogEvent.MemberUpdate, after.id); fields.push({ name: after.isCommunicationDisabled() ? 'סיום השהיה' : 'השהיה הוסרה', value: after.communicationDisabledUntilTimestamp ? `<t:${Math.floor(after.communicationDisabledUntilTimestamp / 1000)}:F>` : 'הוסרה' }, actor(entry), { name: 'סיבה', value: entry?.reason || 'לא צוינה' }); }
    if (fields.length) await emit(after.guild, EVENT_TYPES.MEMBER_UPDATE, { title: '👤 חבר עודכן', userId: after.id, description: `${after.user}`, fields });
  });
  listen(client, Events.UserUpdate, async (before, after) => { const fields=[]; if(before.username!==after.username)fields.push({name:'שם משתמש',value:`${before.username} → ${after.username}`}); if(before.globalName!==after.globalName)fields.push({name:'שם תצוגה',value:`${value(before.globalName)} → ${value(after.globalName)}`}); if(before.avatar!==after.avatar)fields.push({name:'תמונת פרופיל',value:'השתנתה'}); for(const guild of client.guilds.cache.values())if(fields.length&&guild.members.cache.has(after.id))await emit(guild,EVENT_TYPES.MEMBER_UPDATE,{title:'👤 חשבון משתמש עודכן',userId:after.id,fields}); });
  for (const [event, action, title, type] of [[Events.GuildBanAdd,AuditLogEvent.MemberBanAdd,'⛔ משתמש הורחק',EVENT_TYPES.MODERATION_BAN],[Events.GuildBanRemove,AuditLogEvent.MemberBanRemove,'✅ הרחקה בוטלה',EVENT_TYPES.MODERATION_UNBAN]]) listen(client,event,async ban=>{const entry=await findAuditEntry(ban.guild,action,ban.user.id,{delayMs:500});await emit(ban.guild,type,{title,userId:ban.user.id,fields:[{name:'משתמש',value:`${ban.user} (\`${ban.user.id}\`)`},actor(entry),{name:'סיבה',value:entry?.reason||ban.reason||'לא צוינה'}]});});

  for(const [event,action,title,type] of [[Events.ChannelCreate,AuditLogEvent.ChannelCreate,'➕ ערוץ נוצר',EVENT_TYPES.CHANNEL_CHANGE],[Events.ChannelDelete,AuditLogEvent.ChannelDelete,'➖ ערוץ נמחק',EVENT_TYPES.CHANNEL_CHANGE]])listen(client,event,async ch=>{if(!ch.guild)return;const entry=await findAuditEntry(ch.guild,action,ch.id,{delayMs:400});await emit(ch.guild,type,{title,channelId:ch.id,fields:[{name:'שם',value:ch.name},{name:'סוג',value:String(ch.type),inline:true},{name:'קטגוריה',value:ch.parent?.name||'ללא',inline:true},actor(entry)]});});
  listen(client,Events.ChannelUpdate,async(b,a)=>{const props=[['name','שם'],['topic','נושא'],['parentId','קטגוריה'],['rateLimitPerUser','מצב איטי'],['nsfw','NSFW']];const fields=props.filter(([k])=>b[k]!==a[k]).map(([k,l])=>({name:l,value:`${value(b[k])} → ${value(a[k])}`}));const perms=x=>JSON.stringify([...x.permissionOverwrites.cache.values()].map(p=>p.toJSON()));if(perms(b)!==perms(a))fields.push({name:'הרשאות ערוץ',value:'השתנו'});if(fields.length)await emit(a.guild,EVENT_TYPES.CHANNEL_CHANGE,{title:'📝 ערוץ עודכן',channelId:a.id,fields});});
  for(const [event,action,title,type] of [[Events.GuildRoleCreate,AuditLogEvent.RoleCreate,'➕ תפקיד נוצר',EVENT_TYPES.ROLE_CREATE],[Events.GuildRoleDelete,AuditLogEvent.RoleDelete,'➖ תפקיד נמחק',EVENT_TYPES.ROLE_DELETE]])listen(client,event,async role=>{const entry=await findAuditEntry(role.guild,action,role.id,{delayMs:400});await emit(role.guild,type,{title,fields:[{name:'שם',value:role.name},{name:'צבע',value:role.hexColor,inline:true},{name:'מיקום',value:String(role.position),inline:true},actor(entry)]});});
  listen(client,Events.GuildRoleUpdate,async(b,a)=>{const props=[['name','שם'],['hexColor','צבע'],['position','מיקום'],['mentionable','ניתן לאזכור'],['hoist','מוצג בנפרד']];const fields=props.filter(([k])=>b[k]!==a[k]).map(([k,l])=>({name:l,value:`${value(b[k])} → ${value(a[k])}`}));if(!b.permissions.equals(a.permissions))fields.push({name:'הרשאות',value:`${b.permissions.bitfield} → ${a.permissions.bitfield}`});if(fields.length)await emit(a.guild,EVENT_TYPES.ROLE_UPDATE,{title:'🎭 תפקיד עודכן',fields});});
  listen(client,Events.VoiceStateUpdate,async(b,a)=>{const fields=[];let title;if(b.channelId!==a.channelId){title=b.channelId&&a.channelId?'🔊 משתמש עבר חדר קולי':a.channelId?'🔊 משתמש הצטרף לחדר קולי':'🔇 משתמש עזב חדר קולי';fields.push({name:'לפני',value:channelRef(b.channelId),inline:true},{name:'אחרי',value:channelRef(a.channelId),inline:true});}if(b.serverMute!==a.serverMute)fields.push({name:'השתקה על ידי השרת',value:a.serverMute?'הופעלה':'הוסרה'});if(b.serverDeaf!==a.serverDeaf)fields.push({name:'חרשות על ידי השרת',value:a.serverDeaf?'הופעלה':'הוסרה'});if(fields.length)await emit(a.guild,EVENT_TYPES.VOICE_CHANGE,{title:title||'🎙️ מצב קולי עודכן',userId:a.id,fields});});
  for(const [event,title]of[[Events.InviteCreate,'🔗 הזמנה נוצרה'],[Events.InviteDelete,'🔗 הזמנה נמחקה']])listen(client,event,invite=>emit(invite.guild,EVENT_TYPES.INVITE_CHANGE,{title,channelId:invite.channelId,fields:[{name:'קוד',value:`\`${invite.code}\``},{name:'ערוץ',value:channelRef(invite.channelId)},{name:'יוצר',value:invite.inviter?`${invite.inviter}`:'לא זמין'},{name:'מקסימום שימושים',value:String(invite.maxUses||'ללא הגבלה')},{name:'תפוגה',value:invite.expiresTimestamp?`<t:${Math.floor(invite.expiresTimestamp/1000)}:F>`:'ללא'}]}));
  for(const [event,title] of [[Events.GuildEmojiCreate,'אימוג׳י נוסף'],[Events.GuildEmojiDelete,'אימוג׳י הוסר'],[Events.GuildStickerCreate,'מדבקה נוספה'],[Events.GuildStickerDelete,'מדבקה הוסרה']]) listen(client,event,item=>emit(item.guild,EVENT_TYPES.EMOJI_STICKER_CHANGE,{title,fields:[{name:'שם',value:item.name},{name:'מזהה',value:`\`${item.id}\``}]}));
  for(const [event,title] of [[Events.GuildEmojiUpdate,'שם אימוג׳י השתנה'],[Events.GuildStickerUpdate,'שם מדבקה השתנה']]) listen(client,event,(before,after)=>{if(before.name!==after.name)return emit(after.guild,EVENT_TYPES.EMOJI_STICKER_CHANGE,{title,fields:[{name:'לפני',value:before.name},{name:'אחרי',value:after.name},{name:'מזהה',value:`\`${after.id}\``}]});});
  listen(client,Events.GuildUpdate,async(b,a)=>{const props=[['name','שם שרת'],['icon','סמל'],['verificationLevel','רמת אימות'],['defaultMessageNotifications','התראות'],['afkChannelId','ערוץ AFK'],['systemChannelId','ערוץ מערכת']];const fields=props.filter(([k])=>b[k]!==a[k]).map(([k,l])=>({name:l,value:`${value(b[k])} → ${value(a[k])}`}));if(fields.length)await emit(a,EVENT_TYPES.SERVER_UPDATE,{title:'⚙️ השרת עודכן',fields});});
}

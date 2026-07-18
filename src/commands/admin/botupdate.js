import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildUpdateEmbed, getUpdateSettings, parseLines } from '../../services/botUpdateService.js';
import { BOT_OWNER_USER_ID } from '../../config/owner.js';

function addContentOptions(sub, versionRequired = true) {
  return sub.addStringOption(o=>o.setName('version').setDescription('גרסת הבוט').setRequired(versionRequired).setMaxLength(30))
    .addStringOption(o=>o.setName('title').setDescription('כותרת העדכון').setMaxLength(200))
    .addStringOption(o=>o.setName('new_features').setDescription('תכונות חדשות, שורה לכל פריט').setMaxLength(1000))
    .addStringOption(o=>o.setName('fixes').setDescription('תיקונים, שורה לכל פריט').setMaxLength(1000))
    .addStringOption(o=>o.setName('improvements').setDescription('שיפורים, שורה לכל פריט').setMaxLength(1000))
    .addBooleanOption(o=>o.setName('ping_update_role').setDescription('לתייג את תפקיד העדכונים'))
    .addStringOption(o=>o.setName('image').setDescription('קישור לתמונה').setMaxLength(1000))
    .addStringOption(o=>o.setName('changelog').setDescription('קישור ליומן השינויים').setMaxLength(1000));
}
const row = (action, ownerId, nonce) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`botupdate_confirm:${action}:${ownerId}:${nonce}`).setLabel('אישור').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`botupdate_cancel:${ownerId}`).setLabel('ביטול').setStyle(ButtonStyle.Secondary));
function readContent(interaction, fallback) { return { ...fallback,
  version: interaction.options.getString('version') || fallback.version,
  title: interaction.options.getString('title') || fallback.title,
  newFeatures: interaction.options.getString('new_features') === null ? fallback.newFeatures : parseLines(interaction.options.getString('new_features')),
  fixes: interaction.options.getString('fixes') === null ? fallback.fixes : parseLines(interaction.options.getString('fixes')),
  improvements: interaction.options.getString('improvements') === null ? fallback.improvements : parseLines(interaction.options.getString('improvements')),
  imageUrl: interaction.options.getString('image') || fallback.imageUrl,
  changelogUrl: interaction.options.getString('changelog') || fallback.changelogUrl } }

export default { data: new SlashCommandBuilder().setName('botupdate').setDescription('ניהול עדכוני הבוט')
  .addSubcommand(s=>addContentOptions(s.setName('post').setDescription('הצגת תצוגה מקדימה ופרסום עדכון')))
  .addSubcommand(s=>s.setName('preview').setDescription('תצוגה מקדימה של העדכון הנוכחי'))
  .addSubcommand(s=>s.setName('status').setDescription('מצב מערכת העדכונים'))
  .addSubcommand(s=>s.setName('resend').setDescription('פרסום חוזר של העדכון הנוכחי'))
  .addSubcommand(s=>addContentOptions(s.setName('edit').setDescription('עריכת הודעת העדכון האחרונה'), false))
  .addSubcommand(s=>s.setName('delete').setDescription('מחיקת הודעת העדכון האחרונה')),
  async execute(interaction, client) {
    if (!interaction.inGuild() || interaction.user.id !== BOT_OWNER_USER_ID) return interaction.reply({ content:'רק בעל הבוט יכול להשתמש בפקודה הזאת.', flags:MessageFlags.Ephemeral });
    const sub=interaction.options.getSubcommand(), settings=await getUpdateSettings(client,interaction.guildId);
    if(sub==='preview') return interaction.reply({embeds:[buildUpdateEmbed(client,settings.content)],flags:MessageFlags.Ephemeral});
    if(sub==='status'){const link=settings.lastMessageId?`https://discord.com/channels/${interaction.guildId}/${settings.channelId}/${settings.lastMessageId}`:'לא קיים';return interaction.reply({content:`**מצב עדכוני הבוט**\nגרסה נוכחית: \`${settings.currentVersion}\`\nגרסה שפורסמה: \`${settings.lastAnnouncedVersion||'טרם פורסמה'}\`\nערוץ: <#${settings.channelId}>\nתפקיד: ${settings.roleId?`<@&${settings.roleId}>`:'לא הוגדר'}\nפרסום אוטומטי: ${settings.automaticEnabled?'פעיל':'כבוי'}\nפרסום אחרון: ${settings.lastAnnouncementAt?`<t:${Math.floor(new Date(settings.lastAnnouncementAt).getTime()/1000)}:F>`:'אין'}\nהודעה אחרונה: ${link}`,flags:MessageFlags.Ephemeral});}
    if(['resend','delete','edit'].includes(sub)&&!settings.lastMessageId)return interaction.reply({content:'לא נמצא עדכון לפרסום.',flags:MessageFlags.Ephemeral});
    const content=['post','edit'].includes(sub)?readContent(interaction,settings.content):settings.content;
    const nonce=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await client.db.set(`botupdate:pending:${interaction.guildId}:${nonce}`,{action:sub,content,pingRole:interaction.options.getBoolean('ping_update_role')??true,userId:interaction.user.id},600);
    return interaction.reply({content:sub==='delete'?'האם למחוק את הודעת העדכון האחרונה?':'יש לאשר את הפעולה:',embeds:sub==='delete'?[]:[buildUpdateEmbed(client,content,{repeated:sub==='resend'})],components:[row(sub,interaction.user.id,nonce)],flags:MessageFlags.Ephemeral});
  }};

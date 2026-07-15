import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getConfig } from '../../community/store.js';
import { logEvent, EVENT_TYPES } from '../../../services/loggingService.js';
import { createOwnerInboxCase, deliverOwnerInboxCase, isOwnerInboxSubmission } from '../../../services/ownerInboxService.js';

const channelNames = { suggest: 'suggestions', feedback: 'feedback', report: 'reports', selfpromo: 'selfPromotion', lookingforeditor: 'lookingForEditor', lookingforteam: 'lookingForTeam' };
const titles = { suggest: 'הצעה', feedback: 'משוב', report: 'דיווח', selfpromo: 'פרסום עצמי', lookingforeditor: 'חיפוש עורך', lookingforteam: 'חיפוש צוות' };
const allowedValues = {
  feedback: new Set(['השרת', 'הבוט', 'הצוות', 'רעיון לשיפור', 'אחר']),
  report: new Set(['משתמש', 'הודעה', 'הטרדה', 'ספאם', 'גניבת תוכן', 'בעיה טכנית', 'אחר']),
  selfpromo: new Set(['tiktok', 'youtube', 'instagram', 'twitch', 'portfolio', 'other'])
};
const values = (interaction, ids) => Object.fromEntries(ids.map(id => [id, interaction.fields.getTextInputValue(id).trim()]));
const statusButton = (kind, id, status, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`community_status:${kind}:${id}:${status}`).setLabel(label).setStyle(style);

export default {
  name: 'community_form',
  async execute(interaction, client, args) {
    const [kind, encoded] = args;
    const config = await getConfig(client, interaction.guildId);
    const privateOwnerInbox = isOwnerInboxSubmission(interaction.guildId, kind);
    const channelId = config.channels[channelNames[kind]];
    const channel = channelId && interaction.guild.channels.cache.get(channelId);
    if (!privateOwnerInbox && !channel?.isTextBased()) return interaction.reply({ content: kind === 'suggest' ? 'ערוץ ההצעות עדיין לא הוגדר.' : 'ערוץ המערכת עדיין לא הוגדר.', flags: MessageFlags.Ephemeral });
    const cooldownSeconds = config.community.cooldowns[kind] || 0;
    const cooldownKey = `community:${interaction.guildId}:cooldown:${kind}:${interaction.user.id}`;
    const last = Number(await client.db.get(cooldownKey, 0));
    if (Date.now() - last < cooldownSeconds * 1000) return interaction.reply({ content: `יש להמתין עוד ${Math.ceil((last + cooldownSeconds * 1000 - Date.now()) / 60000)} דקות לפני שליחת בקשה נוספת.`, flags: MessageFlags.Ephemeral });

    let data; let components = [];
    if (kind === 'suggest') {
      data = values(interaction, ['title', 'description']);
    } else if (kind === 'feedback') {
      data = values(interaction, ['category', 'content']);
      if (!allowedValues.feedback.has(data.category)) return interaction.reply({ content: 'סוג המשוב אינו תקין. יש לבחור אחת מהקטגוריות המוצגות בטופס.', flags: MessageFlags.Ephemeral });
      data.anonymous = interaction.message == null && interaction.user && false;
      // The slash option is unavailable on modal submit; preserve it in the modal id in future calls.
      data.anonymous = encoded === 'anonymous';
    } else if (kind === 'report') {
      data = values(interaction, ['type', 'reported_user', 'description', 'evidence']);
      if (!allowedValues.report.has(data.type)) return interaction.reply({ content: 'סוג הדיווח אינו תקין.', flags: MessageFlags.Ephemeral });
      if (data.evidence && !/^https?:\/\/\S+$/i.test(data.evidence)) return interaction.reply({ content: 'הקישור שסופק אינו תקין.', flags: MessageFlags.Ephemeral });
    } else if (kind === 'selfpromo') {
      data = values(interaction, ['platform', 'display_name', 'link', 'description']);
      if (!allowedValues.selfpromo.has(data.platform.toLowerCase())) return interaction.reply({ content: 'הפלטפורמה שנבחרה אינה נתמכת.', flags: MessageFlags.Ephemeral });
      if (!/^https?:\/\/\S+$/i.test(data.link)) return interaction.reply({ content: 'הקישור שסופק אינו תקין.', flags: MessageFlags.Ephemeral });
      if (!config.community.allowDiscordInvites && /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i.test(data.link)) return interaction.reply({ content: 'קישורי הזמנה ל־Discord אינם מורשים בפרסום עצמי.', flags: MessageFlags.Ephemeral });
    } else {
      data = kind === 'lookingforeditor'
        ? values(interaction, ['video_type', 'deadline', 'style', 'contact', 'description'])
        : values(interaction, ['project', 'deadline', 'experience', 'contact', 'description']);
      Object.assign(data, JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
    }
    if (privateOwnerInbox) {
      const record = await createOwnerInboxCase(client, interaction, kind, data);
      const delivered = await deliverOwnerInboxCase(client, record);
      await client.db.set(cooldownKey, Date.now());
      return interaction.reply({ content: delivered
        ? '✅ ההודעה שלך נשלחה בהצלחה לצוות השרת.'
        : '⚠️ אירעה תקלה זמנית בשליחת ההודעה.\nהצוות יקבל אותה ברגע שהחיבור יחזור.', flags: MessageFlags.Ephemeral });
    }
    const id = String(await client.db.increment(`community:${interaction.guildId}:sequence:${kind}`));
    const record = { id, kind, authorId: interaction.user.id, ...data, status: 'open', createdAt: Date.now(), handlerId: null };
    const fields = [];
    if (kind === 'suggest') fields.push({ name: 'כותרת', value: data.title }, { name: 'פירוט', value: data.description });
    if (kind === 'feedback') fields.push({ name: 'סוג המשוב', value: data.category }, { name: 'תוכן', value: data.content });
    if (kind === 'report') fields.push({ name: 'סוג', value: data.type, inline: true }, { name: 'משתמש מדווח', value: data.reported_user || 'לא צוין', inline: true }, { name: 'תיאור', value: data.description }, { name: 'הוכחה', value: data.evidence || 'לא צורפה' });
    if (kind === 'selfpromo') fields.push({ name: 'יוצר', value: `${interaction.user}`, inline: true }, { name: 'פלטפורמה', value: data.platform, inline: true }, { name: 'שם תצוגה', value: data.display_name, inline: true }, { name: 'תיאור', value: data.description }, { name: 'קישור', value: `[פתיחת העמוד](${data.link})` });
    if (kind.startsWith('lookingfor')) fields.push({ name: 'תשלום', value: data.paid ? `בתשלום — ${data.budget || 'לא צוין תקציב'}` : 'ללא תשלום', inline: true }, { name: 'מועד אחרון', value: data.deadline, inline: true }, { name: 'יצירת קשר', value: data.contact }, { name: 'פרטים', value: data.description });
    if (kind === 'suggest') components = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`community_vote:suggest:${id}:up`).setLabel('בעד').setEmoji('👍').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`community_vote:suggest:${id}:down`).setLabel('נגד').setEmoji('👎').setStyle(ButtonStyle.Danger),
      statusButton(kind, id, 'approved', 'אושר', ButtonStyle.Success), statusButton(kind, id, 'rejected', 'נדחה', ButtonStyle.Danger), statusButton(kind, id, 'discussion', 'בדיון')
    )];
    if (kind === 'feedback') components = [new ActionRowBuilder().addComponents(statusButton(kind, id, 'reviewed', 'נבדק'), statusButton(kind, id, 'handling', 'בטיפול', ButtonStyle.Primary), statusButton(kind, id, 'completed', 'הושלם', ButtonStyle.Success))];
    if (kind === 'report') components = [new ActionRowBuilder().addComponents(statusButton(kind, id, 'open', 'פתוח'), statusButton(kind, id, 'investigating', 'בבדיקה', ButtonStyle.Primary), statusButton(kind, id, 'resolved', 'טופל', ButtonStyle.Success), statusButton(kind, id, 'closed', 'נסגר', ButtonStyle.Danger))];
    if (kind.startsWith('lookingfor')) components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`community_interest:${kind}:${id}`).setLabel('אני מעוניין').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`community_contact:${kind}:${id}`).setLabel('צור קשר').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`community_close:${kind}:${id}`).setLabel('סגירת הפרסום').setStyle(ButtonStyle.Danger))];
    const publicAuthor = kind === 'feedback' && data.anonymous ? 'אנונימי' : `${interaction.user}`;
    if (!['selfpromo'].includes(kind)) fields.unshift({ name: kind === 'report' ? 'מדווח' : 'מפרסם', value: publicAuthor, inline: true }, { name: 'תאריך', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
    const message = await channel.send({ embeds: [createEmbed({ title: `${titles[kind]} #${id}`, fields, color: kind === 'report' ? 'warning' : 'primary', footer: { text: `מזהה: ${id}` } })], components });
    Object.assign(record, { messageId: message.id, channelId: channel.id });
    await client.db.set(`community:${interaction.guildId}:${kind}:${id}`, record);
    await client.db.set(cooldownKey, Date.now());
    await logEvent({ client, guildId: interaction.guildId, eventType: kind === 'report' ? EVENT_TYPES.REPORT : EVENT_TYPES.SUGGESTION, data: { title: `${titles[kind]} חדש #${id}`, description: `נשלח על ידי <@${interaction.user.id}> לערוץ <#${channel.id}>.` } });
    const confirmations = { suggest: 'ההצעה שלך נשלחה בהצלחה.', feedback: 'המשוב התקבל בהצלחה.', report: `הדיווח התקבל. מספר המקרה שלך הוא #${id}.`, selfpromo: 'הפרסום פורסם בהצלחה.', lookingforeditor: 'בקשת חיפוש העורך פורסמה.', lookingforteam: 'בקשת חיפוש הצוות פורסמה.' };
    return interaction.reply({ content: confirmations[kind], flags: MessageFlags.Ephemeral });
  }
};

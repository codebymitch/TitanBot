import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { AccessLevel, memberAccessLevel, requireAccess } from '../../modules/community/permissions.js';

export const STAFF_HELP_CATEGORIES = Object.freeze({
  tickets: {
    label: 'כרטיסי תמיכה', emoji: '🎫', level: AccessLevel.HELPER,
    commands: [
      ['claim', '/claim', 'לקיחת אחריות על הכרטיס הנוכחי'],
      ['unclaim', '/unclaim', 'שחרור הכרטיס מהמטפל הנוכחי'],
      ['status', '/ticketstatus <status>', 'עדכון מצב הכרטיס'],
      ['priority', '/ticketpriority <priority>', 'עדכון עדיפות הכרטיס'],
      ['members', '/add או /remove <member>', 'ניהול משתתפים בכרטיס'],
      ['rename', '/rename <name>', 'שינוי שם ערוץ הכרטיס'],
      ['transcript', '/transcript', 'יצירת תמלול פרטי'],
      ['close', '/close [reason]', 'סגירת הכרטיס לאחר מסך אישור']
    ]
  },
  moderation: {
    label: 'ניהול ואכיפה', emoji: '🛡️', level: AccessLevel.MODERATOR,
    commands: [
      ['warnings', '/warn, /warnings, /clearwarnings', 'ניהול אזהרות של חברים'],
      ['timeout', '/timeout <member> <duration>', 'הרחקה זמנית — פעולה רגישה'],
      ['kick', '/kick <member> <reason>', 'הוצאת חבר — פעולה רגישה'],
      ['ban', '/ban או /unban', 'חסימה או הסרת חסימה — פעולה רגישה'],
      ['messages', '/clear <amount>', 'מחיקת הודעות אחרונות'],
      ['channel', '/lock, /unlock, /slowmode', 'ניהול כתיבה וקצב בערוץ'],
      ['nickname', '/nick <member> [nickname]', 'שינוי או איפוס כינוי']
    ]
  },
  admin: {
    label: 'ניהול מערכות', emoji: '⚙️', level: AccessLevel.ADMIN,
    commands: [
      ['settings', '/settings', 'מרכז הגדרות השרת והמערכות'],
      ['tickets', '/ticket setup, /ticket disable, /ticketpanel', 'הקמה וניהול של מערכת הכרטיסים'],
      ['members', '/verification, /welcome, /role, /rolepanel', 'אימות, קבלת פנים ותפקידים'],
      ['levels', '/level, /setxp, /resetxp', 'הגדרת רמות ושינוי XP'],
      ['logging', '/logging', 'הגדרת ערוצי לוגים ואירועים'],
      ['content', '/announce, /embed', 'פרסום הודעות בשם הבוט'],
      ['contest', '/contest create או /contest end', 'פתיחה וסיום תחרות עריכה'],
      ['boost', '/testboost', 'בדיקת הודעת בוסט ללא בוסט אמיתי']
    ]
  },
  owner: {
    label: 'בעלים בלבד', emoji: '👑', level: AccessLevel.OWNER,
    commands: [
      ['setup', '/setup', 'הקמה ראשונית של מערכות השרת'],
      ['config', '/config', 'הרשאות וערוצי מערכת מתקדמים'],
      ['updates', '/botupdate', 'ניהול גרסה והודעות עדכון'],
      ['reply', '/reply <case_id>', 'מענה פרטי לדיווח או להצעה'],
      ['maintenance', '/reload, /sync', 'טעינה ורישום פקודות — פעולה מסוכנת'],
      ['debug', '/debug', 'מידע טכני לבעלים בלבד']
    ]
  }
});

export function availableStaffCategories(level) {
  return Object.entries(STAFF_HELP_CATEGORIES).filter(([, category]) => level >= category.level);
}

function categoryEmbed(key, category, level) {
  return createEmbed({
    title: `${category.emoji} מדריך צוות — ${category.label}`,
    description: category.commands.map(([, usage, description]) => `**${usage}**\n${description}`).join('\n\n'),
    color: key === 'owner' ? 'warning' : 'primary',
    footer: { text: `רמת הגישה שלך: ${level}/5 • המדריך גלוי רק לך` }
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('staffhelp')
    .setDescription('מדריך פקודות פרטי המותאם להרשאות הצוות שלך')
    .setDMPermission(false)
    .addStringOption(option => option.setName('category').setDescription('קטגוריית הפקודות להצגה').addChoices(
      ...Object.entries(STAFF_HELP_CATEGORIES).map(([value, category]) => ({ name: `${category.emoji} ${category.label}`, value }))
    )),

  async execute(interaction, client) {
    if (!await requireAccess(interaction, client, AccessLevel.HELPER)) return;
    const level = await memberAccessLevel(interaction, client);
    const available = availableStaffCategories(level);
    const selected = interaction.options.getString('category');

    if (selected) {
      const category = STAFF_HELP_CATEGORIES[selected];
      if (!category || level < category.level) {
        return interaction.reply({ embeds: [createEmbed({ title: 'אין הרשאה', description: 'הקטגוריה הזאת אינה זמינה לרמת הגישה שלך.', color: 'error' })], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [categoryEmbed(selected, category, level)], flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ embeds: [createEmbed({
      title: '📚 מרכז פקודות הצוות',
      description: 'בחרו קטגוריה באמצעות האפשרות `category` כדי לקבל שימושים והסברים. יוצגו רק קטגוריות המותרות לרמת הגישה שלכם.',
      fields: available.map(([key, category]) => ({ name: `${category.emoji} ${category.label}`, value: `**${category.commands.length}** קבוצות פקודות • \`/staffhelp category:${key}\``, inline: true })),
      color: 'primary', footer: { text: `רמת הגישה שלך: ${level}/5 • התשובה פרטית` }
    })], flags: MessageFlags.Ephemeral });
  }
};

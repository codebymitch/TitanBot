import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../utils/embeds.js';

const state = enabled => enabled ? '✅ פעיל' : '❌ כבוי';
const channel = id => id ? `<#${id}>` : 'לא הוגדר';
const role = id => id ? `<@&${id}>` : 'לא הוגדר';
const accessLevels = ['כולם', 'מאומת', 'עוזר', 'מודרטור', 'מנהל', 'בעלים'];

export function createSettingsOverview(config) {
  const modules = Object.entries(config.modules || {}).map(([name, enabled]) => `${enabled ? '✅' : '❌'} ${name}`).join(' • ') || 'אין מודולים';
  const permissions = Object.entries(config.commandPermissions || {});
  const settings = Object.entries(config.commandSettings || {});
  const commandLines = [
    ...permissions.slice(0, 12).map(([name, level]) => `/${name}: ${accessLevels[Number(level)] || `רמה ${level}`}`),
    ...settings.slice(0, Math.max(0, 12 - permissions.length)).map(([name, item]) => `/${name}: ${item?.enabled === false ? 'כבוי' : 'פעיל'}`)
  ];
  return createEmbed({ title: 'הגדרות השרת', description: 'סקירה מלאה של המערכות והפקודות שדורשות הגדרה.', color: 'primary' }).addFields(
    { name: '👋 קבלת פנים', value: `${state(config.welcome.enabled)}\nערוץ: ${channel(config.welcome.channelId)}\nהודעה: ${config.welcome.message ? `\`${String(config.welcome.message).slice(0, 120)}\`` : 'לא הוגדרה'}` },
    { name: '🛡️ אימות', value: `${state(config.verification.enabled)}\nערוץ: ${channel(config.verification.channelId)}\nתפקיד: ${role(config.verification.roleId)}`, inline: true },
    { name: '🎫 פניות', value: `${state(config.tickets.enabled)}\nפאנל: ${channel(config.tickets.panelChannelId)}\nקטגוריה: ${channel(config.tickets.categoryId)}\nצוות: ${role(config.tickets.supportRoleId)}`, inline: true },
    { name: '📋 לוגים', value: `${state(config.logging.enabled)}\nערוץ: ${channel(config.logging.channelId)}\nסוגים כבויים: ${Object.values(config.logging.enabledEvents || {}).filter(v => v === false).length}`, inline: true },
    { name: '📈 רמות', value: `${state(config.leveling.enabled)}\nערוץ עלייה: ${channel(config.leveling.announceChannelId)}\nXP: ${config.leveling.xpMin}–${config.leveling.xpMax}\nהשהיה: ${Math.round(config.leveling.cooldownMs / 1000)} שניות`, inline: true },
    { name: '📣 ערוצי פקודות', value: `הצעות: ${channel(config.channels?.suggestions)}\nדיווחים: ${channel(config.channels?.reports)}\nמשוב: ${channel(config.channels?.feedback)}\nהכרזות: ${channel(config.channels?.announcements)}`, inline: true },
    { name: '👥 תפקידי גישה', value: `מאומת: ${role(config.staffRoles?.verified || config.verification?.roleId)}\nעוזר: ${role(config.staffRoles?.helper)}\nמודרטור: ${role(config.staffRoles?.moderator)}\nמנהל: ${role(config.staffRoles?.administrator)}\nצוות פניות: ${role(config.staffRoles?.ticketStaff || config.tickets?.supportRoleId)}\nבוסטר: ${role(config.staffRoles?.booster)}`, inline: true },
    { name: '🧩 מודולים', value: modules.slice(0, 1024) },
    { name: '🎭 פאנלים ותחרויות', value: `פאנלי תפקידים: **${config.roles?.panels?.length || 0}**\nתחרות פעילה: **${config.contests?.active ? config.contests.active.title : 'אין'}**\nהגשות: **${config.contests?.submissions?.length || 0}**`, inline: true },
    { name: '⚙️ הגדרות פקודות', value: commandLines.length ? commandLines.join('\n').slice(0, 1024) : 'אין דריסות; נעשה שימוש בברירות המחדל.', inline: true }
  );
}

function systemFields(config) {
  return [
    { name: '👋 קבלת פנים', value: `${state(config.welcome.enabled)}\nערוץ: ${channel(config.welcome.channelId)}\nהודעה: ${config.welcome.message ? `\`${String(config.welcome.message).slice(0, 180)}\`` : 'לא הוגדרה'}` },
    { name: '🛡️ אימות', value: `${state(config.verification.enabled)}\nערוץ: ${channel(config.verification.channelId)}\nתפקיד: ${role(config.verification.roleId)}`, inline: true },
    { name: '🎫 פניות', value: `${state(config.tickets.enabled)}\nפאנל: ${channel(config.tickets.panelChannelId)}\nקטגוריה: ${channel(config.tickets.categoryId)}\nצוות: ${role(config.tickets.supportRoleId)}`, inline: true },
    { name: '📈 רמות', value: `${state(config.leveling.enabled)}\nערוץ: ${channel(config.leveling.announceChannelId)}\nXP: ${config.leveling.xpMin}–${config.leveling.xpMax}\nהשהיה: ${Math.round(config.leveling.cooldownMs / 1000)} שניות`, inline: true },
    { name: '🎭 תפקידים ותחרויות', value: `פאנלי תפקידים: **${config.roles?.panels?.length || 0}**\nתחרות: **${config.contests?.active?.title || 'אין'}**\nהגשות: **${config.contests?.submissions?.length || 0}**`, inline: true }
  ];
}

export function createSettingsPage(config, page = 'overview') {
  if (page === 'overview') return createSettingsOverview(config).setFooter({ text: 'בחרו קטגוריה באמצעות הכפתורים למטה' });
  const embed = createEmbed({ title: '⚙️ מרכז הגדרות', description: 'ניהול וסקירת הגדרות השרת במקום אחד.', color: 'primary' });
  if (page === 'systems') embed.setTitle('🧩 מערכות').addFields(systemFields(config));
  if (page === 'access') embed.setTitle('📣 ערוצים ותפקידי גישה').addFields(
    { name: 'ערוצי פקודות', value: `הצעות: ${channel(config.channels?.suggestions)}\nדיווחים: ${channel(config.channels?.reports)}\nמשוב: ${channel(config.channels?.feedback)}\nהכרזות: ${channel(config.channels?.announcements)}`, inline: true },
    { name: 'תפקידי גישה', value: `מאומת: ${role(config.staffRoles?.verified || config.verification?.roleId)}\nעוזר: ${role(config.staffRoles?.helper)}\nמודרטור: ${role(config.staffRoles?.moderator)}\nמנהל: ${role(config.staffRoles?.administrator)}\nצוות פניות: ${role(config.staffRoles?.ticketStaff || config.tickets?.supportRoleId)}\nבוסטר: ${role(config.staffRoles?.booster)}`, inline: true }
  );
  if (page === 'commands') {
    const permissions = Object.entries(config.commandPermissions || {}), settings = Object.entries(config.commandSettings || {});
    embed.setTitle('⌨️ פקודות ומודולים').addFields(
      { name: 'מודולים', value: Object.entries(config.modules || {}).map(([name, enabled]) => `${enabled ? '✅' : '❌'} ${name}`).join('\n').slice(0, 1024) || 'אין' },
      { name: 'רמות גישה מותאמות', value: permissions.map(([name, level]) => `/${name}: **${accessLevels[Number(level)] || `רמה ${level}`}**`).join('\n').slice(0, 1024) || 'אין דריסות.' },
      { name: 'הפעלה לפי פקודה', value: settings.map(([name, item]) => `/${name}: ${item?.enabled === false ? '❌ כבוי' : '✅ פעיל'}`).join('\n').slice(0, 1024) || 'כל הפקודות משתמשות בברירת המחדל.' }
    );
  }
  if (page === 'logging') {
    const disabled = Object.entries(config.logging.enabledEvents || {}).filter(([, enabled]) => enabled === false).map(([name]) => `❌ ${name}`);
    embed.setTitle('📋 מערכת לוגים').addFields(
      { name: 'מצב', value: state(config.logging.enabled), inline: true },
      { name: 'ערוץ', value: channel(config.logging.channelId), inline: true },
      { name: 'אירועים כבויים', value: disabled.join('\n').slice(0, 1024) || '✅ כל סוגי האירועים פעילים' },
      { name: 'ניהול', value: 'השתמשו ב-`/settings logging` כדי לבחור ערוץ, לבדוק אותו, ולהפעיל או לכבות סוגי אירועים.' }
    );
  }
  return embed.setFooter({ text: 'הנתונים מוצגים בזמן אמת • לחצו רענון לעדכון' });
}

export function createSettingsComponents(userId, page = 'overview') {
  const button = (id, label, emoji) => new ButtonBuilder().setCustomId(`settings_page:${userId}:${id}`).setLabel(label).setEmoji(emoji).setStyle(id === page ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(id === page);
  return [
    new ActionRowBuilder().addComponents(button('overview', 'סקירה', '🏠'), button('systems', 'מערכות', '🧩'), button('access', 'ערוצים ותפקידים', '👥')),
    new ActionRowBuilder().addComponents(button('commands', 'פקודות', '⌨️'), button('logging', 'לוגים', '📋'), new ButtonBuilder().setCustomId(`settings_page:${userId}:refresh:${page}`).setLabel('רענון').setEmoji('🔄').setStyle(ButtonStyle.Success))
  ];
}

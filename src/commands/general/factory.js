import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SlashCommandBuilder, version as discordVersion } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';
import packageJson from '../../../package.json' with { type: 'json' };

const base = name => new SlashCommandBuilder().setName(name).setDescription(`EditIL ${name}`).setDMPermission(false);
const date = value => value ? `<t:${Math.floor(value / 1000)}:D>` : 'לא זמין';
const uptime = seconds => `${Math.floor(seconds / 86400)} ימים, ${Math.floor(seconds % 86400 / 3600)} שעות, ${Math.floor(seconds % 3600 / 60)} דקות`;

export function generalCommand(name) {
  const data = base(name);
  if (['userinfo', 'avatar'].includes(name)) data.addUserOption(o => o.setName('member').setDescription('Member to display'));
  return { data, async execute(i, client) {
    if (!await requireAccess(i, client, AccessLevel.EVERYONE)) return;
    const user = i.options.getUser('member') || i.user;
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    const guild = i.guild;
    let embed;
    let components = [];

    if (name === 'ping') {
      const db = client.db.getStatus?.();
      embed = createEmbed({ title: '🏓 בדיקת תקשורת', description: `זמן התגובה של הבוט: **${Math.max(0, Math.round(client.ws.ping))}ms**\nמסד נתונים: **${db?.isDegraded ? 'מצב זמני (לא מחובר)' : 'מחובר'}**`, color: db?.isDegraded ? 'warning' : 'success' });
    } else if (name === 'botinfo') {
      const users = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
      const developer = process.env.DEVELOPER_ID ? `<@${process.env.DEVELOPER_ID}>` : 'לא הוגדר';
      embed = createEmbed({ title: `מידע על ${client.user.username}`, description: `גרסה: **${packageJson.version}**\nזמן פעילות: **${uptime(process.uptime())}**\nשרתים: **${client.guilds.cache.size}**\nמשתמשים: **${users}**\nפקודות טעונות: **${client.commands.size}**\ndiscord.js: **${discordVersion}**\nמפתח: ${developer}`, color: 'primary' }).setThumbnail(client.user.displayAvatarURL());
    } else if (name === 'serverinfo') {
      await guild.members.fetch().catch(() => {});
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      embed = createEmbed({ title: guild.name, description: `בעלים: <@${guild.ownerId}>\nנוצר: ${date(guild.createdTimestamp)}\nחברים: **${guild.memberCount}** (מתוכם ${bots} בוטים)\nערוצים: **${guild.channels.cache.size}**\nתפקידים: **${guild.roles.cache.size}**\nרמת בוסט: **${guild.premiumTier}**\nבוסטים: **${guild.premiumSubscriptionCount || 0}**`, color: 'primary' });
      if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 512 }));
    } else if (name === 'userinfo') {
      const importantRoles = member?.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).first(8).map(String).join(', ') || 'אין';
      embed = createEmbed({ title: `מידע על ${user.username}`, description: `שם תצוגה: **${member?.displayName || user.globalName || user.username}**\nחשבון נוצר: ${date(user.createdTimestamp)}\nהצטרף לשרת: ${date(member?.joinedTimestamp)}\nהתפקיד הגבוה ביותר: ${member?.roles.highest || 'אין'}\nתפקידים חשובים: ${importantRoles}\nחשבון בוט: **${user.bot ? 'כן' : 'לא'}**`, color: 'primary' }).setThumbnail(user.displayAvatarURL({ size: 512 }));
    } else if (name === 'avatar') {
      const url = user.displayAvatarURL({ size: 4096, extension: user.avatar?.startsWith('a_') ? 'gif' : 'png' });
      embed = createEmbed({ title: `תמונת הפרופיל של ${user.username}`, description: 'לחצו על הכפתור לפתיחת התמונה באיכות מלאה.', color: 'primary' }).setImage(url);
      components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('פתיחת התמונה').setStyle(ButtonStyle.Link).setURL(url))];
    } else {
      const allowed = [...client.commands.values()].filter(c => !['owner', 'admin', 'moderation'].includes(c.category));
      embed = createEmbed({ title: 'מרכז העזרה', description: allowed.map(c => `</${c.data.name}:0> — ${c.data.description}`).join('\n').slice(0, 4000) || 'לא נמצאו פקודות זמינות.', color: 'primary' });
    }
    await i.reply({ embeds: [embed], components, flags: name === 'serverinfo' || name === 'userinfo' || name === 'avatar' || name === 'botinfo' ? undefined : MessageFlags.Ephemeral });
  } };
}

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';

const base = name => new SlashCommandBuilder().setName(name).setDescription(`EditIL ${name}`).setDMPermission(false);
export function generalCommand(name) {
  const data = base(name);
  if (['userinfo', 'avatar'].includes(name)) data.addUserOption(o => o.setName('member').setDescription('Member to display'));
  return { data, async execute(i, client) {
    if (!await requireAccess(i, client, AccessLevel.EVERYONE)) return;
    const user = i.options.getUser('member') || i.user;
    const guild = i.guild;
    const payload = {
      help: ['מרכז העזרה', `השתמשו בפקודות הסלאש לפי הקטגוריות: מידע, קהילה, רמות, פניות, תחרויות וניהול. לרשימת הפקודות המלאה הקלידו \`/\` וצפו בהשלמה האוטומטית.`],
      ping: ['בדיקת תקשורת', `זמן תגובת הבוט: **${Math.max(0, Math.round(client.ws.ping))}ms**`],
      botinfo: ['מידע על הבוט', `**${client.user.username}** מסייע לקהילת עורכי ישראל.\nשרתים: **${client.guilds.cache.size}**\nזמן פעילות: **${Math.floor(process.uptime()/60)} דקות**`],
      serverinfo: ['מידע על השרת', `**${guild.name}**\nחברים: **${guild.memberCount}**\nנוצר: <t:${Math.floor(guild.createdTimestamp/1000)}:D>`],
      userinfo: ['מידע על משתמש', `${user}\nמזהה: \`${user.id}\`\nנוצר: <t:${Math.floor(user.createdTimestamp/1000)}:D>`],
      avatar: ['תמונת פרופיל', `[פתיחת התמונה בגודל מלא](${user.displayAvatarURL({ size: 4096 })})`]
    }[name];
    const embed = createEmbed({ title: payload[0], description: payload[1], color: 'primary' });
    if (name === 'avatar') embed.setImage(user.displayAvatarURL({ size: 1024 }));
    await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }};
}

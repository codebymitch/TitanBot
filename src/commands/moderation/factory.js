import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { warningKey } from '../../modules/community/store.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';

const EPHEMERAL = MessageFlags.Ephemeral;
const requiredPermission = {
  timeout: PermissionFlagsBits.ModerateMembers, kick: PermissionFlagsBits.KickMembers,
  clear: PermissionFlagsBits.ManageMessages, lock: PermissionFlagsBits.ManageChannels,
  unlock: PermissionFlagsBits.ManageChannels, slowmode: PermissionFlagsBits.ManageChannels,
  nick: PermissionFlagsBits.ManageNicknames
};
const reply = (i, description, color = 'success') => i.reply({ embeds: [createEmbed({ title: 'ניהול השרת', description, color })], flags: EPHEMERAL });

function parseDuration(value) {
  const match = /^(\d+)\s*([mhd])$/i.exec(value || '');
  if (!match) return null;
  const factors = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  const ms = Number(match[1]) * factors[match[2].toLowerCase()];
  return ms > 0 && ms <= 28 * 86_400_000 ? ms : null;
}

function targetError(i, member) {
  if (member.id === i.guild.ownerId) return 'לא ניתן לבצע פעולת ניהול על בעל השרת.';
  if (member.id === i.user.id) return 'לא ניתן לבצע את הפעולה על עצמך.';
  if (member.id === i.client.user.id) return 'לא ניתן לבצע את הפעולה על הבוט.';
  if (member.roles.highest.position >= i.member.roles.highest.position && i.user.id !== i.guild.ownerId) return 'תפקיד המשתמש גבוה מדי בהיררכיית התפקידים שלך.';
  if (member.roles.highest.position >= i.guild.members.me.roles.highest.position) return 'תפקיד הבוט נמוך מדי בהיררכיית התפקידים.';
  return null;
}

export function moderationCommand(name) {
  const data = new SlashCommandBuilder().setName(name).setDescription(`EditIL ${name}`).setDMPermission(false);
  if (['warn', 'warnings', 'clearwarnings', 'timeout', 'kick', 'nick'].includes(name)) data.addUserOption(o => o.setName('member').setDescription('Target member').setRequired(true));
  if (name === 'timeout') data.addStringOption(o => o.setName('duration').setDescription('Duration, for example 10m, 2h or 1d').setRequired(true));
  if (['warn', 'timeout', 'kick'].includes(name)) data.addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(500));
  if (name === 'clearwarnings') data.addStringOption(o => o.setName('warning_id').setDescription('Warning ID; omit to clear all'));
  if (name === 'clear') data.addIntegerOption(o => o.setName('amount').setDescription('Messages').setRequired(true).setMinValue(1).setMaxValue(100)).addUserOption(o => o.setName('member').setDescription('Only messages from this member'));
  if (name === 'slowmode') data.addIntegerOption(o => o.setName('seconds').setDescription('0-21600').setRequired(true).setMinValue(0).setMaxValue(21600));
  if (['lock', 'unlock', 'slowmode'].includes(name)) data.addChannelOption(o => o.setName('channel').setDescription('Channel; defaults to current').addChannelTypes(ChannelType.GuildText));
  if (name === 'nick') data.addStringOption(o => o.setName('nickname').setDescription('New nickname; omit to reset').setMaxLength(32));

  return { data, async execute(i, client) {
    const access = name === 'clearwarnings' ? AccessLevel.ADMIN : AccessLevel.MODERATOR;
    if (!await requireAccess(i, client, access)) return;
    const permission = requiredPermission[name];
    if (permission && !i.guild.members.me.permissions.has(permission)) return reply(i, 'לבוט חסרה ההרשאה הדרושה לביצוע הפעולה.', 'error');
    const reason = i.options.getString('reason') || 'לא צוינה סיבה';

    if (['lock', 'unlock'].includes(name)) {
      const channel = i.options.getChannel('channel') || i.channel;
      const overwrite = channel.permissionOverwrites.cache.get(i.guild.roles.everyone.id);
      const previous = overwrite?.allow.has(PermissionFlagsBits.SendMessages) ? true : overwrite?.deny.has(PermissionFlagsBits.SendMessages) ? false : null;
      const key = `community:${i.guildId}:lock:${channel.id}`;
      if (name === 'lock') {
        if ((await client.db.get(key, null)) !== null) return reply(i, 'הערוץ כבר נעול.', 'warning');
        await client.db.set(key, { previous, by: i.user.id, at: Date.now() });
        await channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false }, { reason: `Locked by ${i.user.tag}` });
        return reply(i, `${channel} ננעל.`);
      }
      const saved = await client.db.get(key, null);
      if (!saved) return reply(i, 'לא נמצא מצב הרשאות שמור לערוץ הזה.', 'warning');
      await channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: saved.previous }, { reason: `Unlocked by ${i.user.tag}` });
      await client.db.delete(key);
      return reply(i, `ההרשאה הקודמת של ${channel} שוחזרה.`);
    }
    if (name === 'slowmode') {
      const channel = i.options.getChannel('channel') || i.channel;
      await channel.setRateLimitPerUser(i.options.getInteger('seconds'), `Changed by ${i.user.tag}`);
      return reply(i, `מצב איטי עודכן ב-${channel}.`);
    }
    if (name === 'clear') {
      const amount = i.options.getInteger('amount');
      const user = i.options.getUser('member');
      const fetched = await i.channel.messages.fetch({ limit: 100 });
      const selected = fetched.filter(m => !m.pinned && (!user || m.author.id === user.id)).first(amount);
      const deleted = await i.channel.bulkDelete(selected, true);
      return reply(i, `נמחקו **${deleted.size}** הודעות.`);
    }

    const user = i.options.getUser('member');
    const member = await i.guild.members.fetch(user.id);
    const key = warningKey(i.guildId, user.id);
    if (['warn', 'warnings', 'clearwarnings'].includes(name)) {
      const warnings = await client.db.get(key, []);
      if (name === 'warn') {
        const warning = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, reason, moderatorId: i.user.id, createdAt: Date.now(), active: true };
        warnings.push(warning); await client.db.set(key, warnings);
        await user.send(`קיבלת אזהרה בשרת ${i.guild.name}. סיבה: ${reason} (מזהה: ${warning.id})`).catch(() => {});
        return reply(i, `${user} קיבל אזהרה. מזהה: \`${warning.id}\`.`);
      }
      if (name === 'clearwarnings') {
        const id = i.options.getString('warning_id');
        if (id && !warnings.some(w => w.id === id && w.active !== false)) return reply(i, 'לא נמצאה אזהרה פעילה עם המזהה הזה.', 'error');
        const next = warnings.map(w => (!id || w.id === id) && w.active !== false ? { ...w, active: false, removedBy: i.user.id, removedAt: Date.now() } : w);
        await client.db.set(key, next); return reply(i, id ? 'האזהרה הוסרה ונשמרה ברשומת הביקורת.' : 'כל האזהרות הפעילות הוסרו ונשמרו ברשומת הביקורת.');
      }
      const lines = warnings.map(w => `**${w.id || 'ישן'}** — ${w.reason}\n<@${w.moderatorId}> · <t:${Math.floor(w.createdAt / 1000)}:d> · ${w.active === false ? 'הוסרה' : 'פעילה'}`);
      return i.reply({ embeds: [createEmbed({ title: `אזהרות — ${user.username}`, description: lines.join('\n\n') || 'אין אזהרות.', color: 'primary' })], flags: EPHEMERAL });
    }

    const error = targetError(i, member);
    if (error) return reply(i, error, 'error');
    if (name === 'timeout') {
      const duration = parseDuration(i.options.getString('duration'));
      if (!duration) return reply(i, 'משך הזמן אינו תקין. השתמשו למשל ב־`10m`, `2h` או `1d` (עד 28 ימים).', 'error');
      await user.send(`הוטל עליך timeout בשרת ${i.guild.name}. סיבה: ${reason}`).catch(() => {});
      await member.timeout(duration, reason);
    } else if (name === 'kick') {
      await user.send(`הוסרת מהשרת ${i.guild.name}. סיבה: ${reason}`).catch(() => {});
      await member.kick(reason);
    } else if (name === 'nick') await member.setNickname(i.options.getString('nickname'), `Changed by ${i.user.tag}`);
    return reply(i, `הפעולה **${name}** בוצעה על ${user}.`);
  } };
}

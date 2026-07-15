import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';

export default {
  data: new SlashCommandBuilder().setName('unban').setDescription('Unban a user').setDMPermission(false)
    .addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(500)),
  async execute(i, client) {
    if (!await requireAccess(i, client, AccessLevel.ADMIN)) return;
    if (!i.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return i.reply({ content: 'לבוט חסרה הרשאת חסימת חברים.', flags: MessageFlags.Ephemeral });
    const id = i.options.getString('user_id');
    if (!/^\d{17,20}$/.test(id)) return i.reply({ content: 'מזהה המשתמש אינו תקין.', flags: MessageFlags.Ephemeral });
    const ban = await i.guild.bans.fetch(id).catch(() => null);
    if (!ban) return i.reply({ content: 'המשתמש הזה אינו חסום בשרת.', flags: MessageFlags.Ephemeral });
    await i.guild.members.unban(id, i.options.getString('reason'));
    await i.reply({ content: `${ban.user} הוסר מרשימת החסומים.`, flags: MessageFlags.Ephemeral });
  }
};

import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';

export default {
  data: new SlashCommandBuilder().setName('ban').setDescription('Ban a member').setDMPermission(false)
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(500))
    .addIntegerOption(o => o.setName('delete_messages').setDescription('Delete recent message hours (0-168)').setMinValue(0).setMaxValue(168)),
  async execute(i, client) {
    if (!await requireAccess(i, client, AccessLevel.ADMIN)) return;
    if (!i.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return i.reply({ content: 'לבוט חסרה הרשאת חסימת חברים.', flags: MessageFlags.Ephemeral });
    const user = i.options.getUser('member'); const member = await i.guild.members.fetch(user.id); const reason = i.options.getString('reason');
    if ([i.user.id, i.client.user.id, i.guild.ownerId].includes(user.id) || member.roles.highest.position >= i.guild.members.me.roles.highest.position || (i.user.id !== i.guild.ownerId && member.roles.highest.position >= i.member.roles.highest.position)) return i.reply({ content: 'לא ניתן לחסום את המשתמש בגלל כללי הבטיחות או היררכיית התפקידים.', flags: MessageFlags.Ephemeral });
    await user.send(`נחסמת בשרת ${i.guild.name}. סיבה: ${reason}`).catch(() => {});
    await member.ban({ reason, deleteMessageSeconds: (i.options.getInteger('delete_messages') || 0) * 3600 });
    await i.reply({ embeds: [createEmbed({ title: 'המשתמש נחסם', description: `${user} נחסם.\nסיבה: ${reason}`, color: 'success' })], flags: MessageFlags.Ephemeral });
  }
};

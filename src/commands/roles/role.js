import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';
import { getConfig } from '../../modules/community/store.js';
import { roleTemplates, validateRoleAction } from '../../services/roleSystemService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

const templates = Object.keys(roleTemplates).map(value => ({ name: value, value }));
const data = new SlashCommandBuilder().setName('role').setDescription('ניהול תפקידים בשרת').setDMPermission(false)
  .addSubcommand(s => s.setName('add').setDescription('הוספת תפקיד לחבר').addUserOption(o=>o.setName('member').setDescription('חבר').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('תפקיד').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('סיבה').setMaxLength(500)))
  .addSubcommand(s => s.setName('remove').setDescription('הסרת תפקיד מחבר').addUserOption(o=>o.setName('member').setDescription('חבר').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('תפקיד').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('סיבה').setMaxLength(500)))
  .addSubcommand(s => s.setName('info').setDescription('מידע על תפקיד').addRoleOption(o=>o.setName('role').setDescription('תפקיד').setRequired(true)))
  .addSubcommand(s => s.setName('create').setDescription('יצירת תפקיד').addStringOption(o=>o.setName('name').setDescription('שם').setRequired(true).setMaxLength(100)).addStringOption(o=>o.setName('color').setDescription('צבע HEX, לדוגמה #5865F2').setRequired(true)).addBooleanOption(o=>o.setName('hoist').setDescription('הצגה בנפרד').setRequired(true)).addBooleanOption(o=>o.setName('mentionable').setDescription('ניתן לתיוג').setRequired(true)).addStringOption(o=>o.setName('permission_template').setDescription('תבנית הרשאות').setRequired(true).addChoices(...templates)))
  .addSubcommand(s => s.setName('delete').setDescription('מחיקת תפקיד').addRoleOption(o=>o.setName('role').setDescription('תפקיד').setRequired(true)));

export default { data, async execute(interaction, client) {
  const sub = interaction.options.getSubcommand(); const role = interaction.options.getRole('role');
  if (sub === 'info') return interaction.reply({ embeds: [createEmbed({ title: `מידע על ${role.name}`, color: role.hexColor === '#000000' ? 'primary' : role.color, fields: [
    {name:'מזהה',value:`\`${role.id}\``,inline:true},{name:'צבע',value:role.hexColor,inline:true},{name:'מיקום',value:String(role.position),inline:true},{name:'חברים',value:String(role.members.size),inline:true},{name:'ניתן לתיוג',value:role.mentionable?'כן':'לא',inline:true},{name:'מוצג בנפרד',value:role.hoist?'כן':'לא',inline:true},{name:'מנוהל',value:role.managed?'כן':'לא',inline:true},{name:'נוצר',value:`<t:${Math.floor(role.createdTimestamp/1000)}:F>`},{name:'הרשאות',value:role.permissions.toArray().join(', ').slice(0,1024)||'ללא'}
  ] })], flags: MessageFlags.Ephemeral });
  const required = ['add','remove'].includes(sub) ? AccessLevel.MODERATOR : AccessLevel.ADMIN;
  if (!await requireAccess(interaction, client, required, `role.${sub}`)) return;
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content: 'אין לך הרשאת ניהול תפקידים.', flags: MessageFlags.Ephemeral });
  if (['add','remove'].includes(sub)) {
    const member = interaction.options.getMember('member'); const error = await validateRoleAction(interaction.guild, interaction.member, role);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    const config = await getConfig(client, interaction.guildId);
    if (member.id === interaction.guild.ownerId || (member.id === interaction.user.id && Object.values(config.staffRoles).includes(role.id))) return interaction.reply({ content: 'לא ניתן לשנות הרשאות צוות של עצמך או של בעל השרת.', flags: MessageFlags.Ephemeral });
    const reason = interaction.options.getString('reason') || `בוצע על ידי ${interaction.user.tag}`;
    await member.roles[sub === 'add' ? 'add' : 'remove'](role, reason);
    await logEvent({ client, guildId: interaction.guildId, eventType: EVENT_TYPES.ROLE_UPDATE, data: { title: sub === 'add'?'תפקיד נוסף':'תפקיד הוסר', description:`${role} ${sub==='add'?'נוסף אל':'הוסר מאת'} ${member}.`, fields:[{name:'צוות',value:`${interaction.user}`},{name:'סיבה',value:reason}] } });
    return interaction.reply({ content: `${role} ${sub==='add'?'נוסף אל':'הוסר מאת'} ${member} בהצלחה.`, flags: MessageFlags.Ephemeral });
  }
  if (sub === 'create') {
    const color = interaction.options.getString('color'); if (!/^#[0-9a-f]{6}$/i.test(color)) return interaction.reply({ content:'הצבע אינו תקין. יש להזין צבע HEX מלא.', flags:MessageFlags.Ephemeral });
    const pending={action:'create',name:interaction.options.getString('name'),color,hoist:interaction.options.getBoolean('hoist'),mentionable:interaction.options.getBoolean('mentionable'),template:interaction.options.getString('permission_template'),actorId:interaction.user.id}; const id=String(await client.db.increment(`community:${interaction.guildId}:sequence:roleaction`)); await client.db.set(`community:${interaction.guildId}:roleaction:${id}`,pending,600);
    return interaction.reply({embeds:[createEmbed({title:'אישור יצירת תפקיד',description:`שם: **${pending.name}**\nצבע: **${color}**\nתבנית: **${pending.template}**`,color:'warning'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`role_confirm:${id}`).setLabel('אישור יצירה').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`role_cancel:${id}`).setLabel('ביטול').setStyle(ButtonStyle.Secondary))],flags:MessageFlags.Ephemeral});
  }
  if (interaction.user.id !== interaction.guild.ownerId) return interaction.reply({content:'רק בעל השרת יכול למחוק תפקידים.',flags:MessageFlags.Ephemeral});
  const error=await validateRoleAction(interaction.guild,interaction.member,role); if(error)return interaction.reply({content:error,flags:MessageFlags.Ephemeral});
  const id=String(await client.db.increment(`community:${interaction.guildId}:sequence:roleaction`)); await client.db.set(`community:${interaction.guildId}:roleaction:${id}`,{action:'delete',roleId:role.id,actorId:interaction.user.id},600);
  return interaction.reply({embeds:[createEmbed({title:'אישור מחיקת תפקיד',description:`האם למחוק את ${role}? התפקיד נמצא אצל **${role.members.size}** חברים.`,color:'error'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`role_confirm:${id}`).setLabel('מחיקה').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`role_cancel:${id}`).setLabel('ביטול').setStyle(ButtonStyle.Secondary))],flags:MessageFlags.Ephemeral});
} };

import { MessageFlags } from 'discord.js';
import { getConfig } from '../../community/store.js';

export default { name: 'editing_roles', async execute(interaction, client, args) {
  if (args[0] !== interaction.user.id) return interaction.reply({ content: 'רק מי שפתח את התפריט יכול להשתמש בו.', flags: MessageFlags.Ephemeral });
  const config = await getConfig(client, interaction.guildId);
  const protectedIds = Object.values(config.staffRoles || {}).filter(Boolean);
  const allowed = (config.community.editingRoleIds || []).filter(id => !protectedIds.includes(id));
  const roles = allowed.map(id => interaction.guild.roles.cache.get(id)).filter(role => role && !role.managed && role.position < interaction.guild.members.me.roles.highest.position);
  const selected = interaction.values.filter(id => roles.some(role => role.id === id));
  const current = roles.filter(role => interaction.member.roles.cache.has(role.id)).map(role => role.id);
  const add = selected.filter(id => !current.includes(id)); const remove = current.filter(id => !selected.includes(id));
  if (add.length) await interaction.member.roles.add(add, 'בחירת תחומי עריכה');
  if (remove.length) await interaction.member.roles.remove(remove, 'עדכון תחומי עריכה');
  return interaction.update({ content: `הבחירה עודכנה. נוספו ${add.length} תפקידים והוסרו ${remove.length}.`, embeds: [], components: [] });
} };

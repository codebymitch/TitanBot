import { ActionRowBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getConfig } from '../../modules/community/store.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';
import { PANEL_CATEGORIES, validateRoleAction } from '../../services/roleSystemService.js';

export default { data: new SlashCommandBuilder().setName('roles').setDescription('הצגת תפקידים זמינים לבחירה עצמית').setDMPermission(false), async execute(interaction, client) {
  if (!await requireAccess(interaction, client, AccessLevel.EVERYONE)) return;
  const config = await getConfig(client, interaction.guildId); const components = []; const fields = [];
  for (const [categoryId, category] of Object.entries(config.roles.categories || {})) {
    if (category.enabled === false) continue;
    const roles = [];
    for (const id of category.roleIds || []) {
      const role = interaction.guild.roles.cache.get(id);
      if (role && !await validateRoleAction(interaction.guild, interaction.member, role, { selfAssignable: true })) roles.push(role);
    }
    if (!roles.length || components.length >= 5) continue;
    fields.push({ name: PANEL_CATEGORIES[categoryId] || category.name || categoryId, value: roles.map(String).join(', ') });
    components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`self_roles:${interaction.user.id}:${categoryId}`).setPlaceholder(PANEL_CATEGORIES[categoryId] || category.name || 'בחרו תפקידים').setMinValues(0).setMaxValues(Math.min(category.maxSelections || roles.length, roles.length)).addOptions(roles.map(role => ({ label: role.name, value: role.id, default: interaction.member.roles.cache.has(role.id) })))));
  }
  if (!components.length) return interaction.reply({ content: 'לא הוגדרו תפקידים זמינים לבחירה עצמית.', flags: MessageFlags.Ephemeral });
  return interaction.reply({ embeds: [createEmbed({ title: '🎭 בחירת תפקידים', description: 'בחרו או הסירו תפקידים לפי הקטגוריות שהוגדרו.', fields, color: 'primary' })], components, flags: MessageFlags.Ephemeral });
} };

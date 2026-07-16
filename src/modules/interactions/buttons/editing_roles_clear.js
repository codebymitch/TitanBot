import { MessageFlags } from 'discord.js';
import { getConfig } from '../../community/store.js';

export default {
  name: 'editing_roles_clear',
  async execute(interaction, client, args) {
    if (args[0] !== interaction.user.id) {
      return interaction.reply({ content: 'רק מי שפתח את התפריט יכול להשתמש בו.', flags: MessageFlags.Ephemeral });
    }

    const config = await getConfig(client, interaction.guildId);
    const protectedIds = Object.values(config.staffRoles || {}).filter(Boolean);
    const removable = (config.community.editingRoleIds || [])
      .filter(id => !protectedIds.includes(id) && interaction.member.roles.cache.has(id))
      .map(id => interaction.guild.roles.cache.get(id))
      .filter(role => role && !role.managed && role.position < interaction.guild.members.me.roles.highest.position)
      .map(role => role.id);

    if (removable.length) await interaction.member.roles.remove(removable, 'ניקוי תחומי עריכה');
    return interaction.update({ content: removable.length ? `הוסרו ${removable.length} תחומי עריכה.` : 'לא היו תחומי עריכה להסרה.', embeds: [], components: [] });
  }
};

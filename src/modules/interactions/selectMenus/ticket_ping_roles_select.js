import { MessageFlags } from 'discord.js';
import { BOT_OWNER_USER_ID } from '../../../config/owner.js';
import { getConfig, updateConfig } from '../../community/store.js';
import { createSettingsComponents, createSettingsPage } from '../../../services/settingsOverview.js';

export default {
  name: 'ticket_ping_roles_select',
  async execute(interaction, client, args) {
    const [ownerId] = args;
    if (interaction.user.id !== ownerId || interaction.user.id !== BOT_OWNER_USER_ID) {
      return interaction.reply({
        content: 'רק בעל הבוט שפתח את לוח ההגדרות יכול לשנות את תפקידי ההתראה.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const roleIds = [...new Set(interaction.values)]
      .filter(roleId => roleId !== interaction.guildId && interaction.guild.roles.cache.has(roleId))
      .slice(0, 10);
    if (!roleIds.length) {
      return interaction.reply({
        content: 'יש לבחור לפחות תפקיד התראה תקין אחד.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const config = await updateConfig(client, interaction.guildId, {
      tickets: { pingRoleIds: roleIds },
    });
    return interaction.update({
      content: `נשמרו ${roleIds.length} תפקידי התראה.`,
      embeds: [createSettingsPage(config, 'tickets')],
      components: createSettingsComponents(ownerId, 'tickets'),
    });
  },
};

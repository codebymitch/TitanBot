import {
  ActionRowBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
} from 'discord.js';
import { BOT_OWNER_USER_ID } from '../../../config/owner.js';
import { getConfig } from '../../community/store.js';

export default {
  name: 'ticket_ping_roles',
  async execute(interaction, client, args) {
    const [ownerId] = args;
    if (interaction.user.id !== ownerId || interaction.user.id !== BOT_OWNER_USER_ID) {
      return interaction.reply({
        content: 'רק בעל הבוט שפתח את לוח ההגדרות יכול לשנות את תפקידי ההתראה.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const config = await getConfig(client, interaction.guildId);
    const selected = config.tickets.pingRoleIds?.length
      ? config.tickets.pingRoleIds
      : [config.tickets.supportRoleId].filter(Boolean);
    const menu = new RoleSelectMenuBuilder()
      .setCustomId(`ticket_ping_roles_select:${ownerId}`)
      .setPlaceholder('בחרו עד 10 תפקידים שיקבלו התראה')
      .setMinValues(1)
      .setMaxValues(10);
    if (selected.length) menu.setDefaultRoles(...selected.slice(0, 10));
    return interaction.update({
      content: 'בחרו את כל התפקידים שיקבלו תיוג בפתיחת כרטיס ובהזעקת צוות. הבחירה לא מעניקה גישה לכרטיס.',
      embeds: [],
      components: [new ActionRowBuilder().addComponents(menu)],
    });
  },
};

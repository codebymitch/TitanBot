import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { getTicketData } from '../services/database.js';

export async function getTicketPermissionContext({ client, interaction }) {
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;

  const [config, ticketData] = await Promise.all([
    getGuildConfig(client, guildId),
    getTicketData(guildId, channelId)
  ]);

  const hasManageChannels = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
  const staffRoleId = config.ticketStaffRoleId || null;
  const hasTicketStaffRole = Boolean(staffRoleId && interaction.member.roles?.cache?.has(staffRoleId));
  const isTicketCreator = Boolean(ticketData?.userId && ticketData.userId === interaction.user.id);

  return {
    config,
    ticketData,
    hasManageChannels,
    hasTicketStaffRole,
    isTicketCreator,
    canManageTicket: hasManageChannels || hasTicketStaffRole,
    canCloseTicket: hasManageChannels || hasTicketStaffRole || isTicketCreator,
  };
}

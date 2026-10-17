// ticketPermissions.js

import { PermissionFlagsBits } from 'discord.js';
import type { ButtonInteraction, ChatInputCommandInteraction, GuildMember, ModalSubmitInteraction } from 'discord.js';
import type { NexoClient } from '../../types/index.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getTicketData } from '../database.js';

export async function getTicketPermissionContext({ client, interaction }: {
  client: NexoClient;
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;
}) {
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId!;

  const [config, ticketData] = await Promise.all([
    getGuildConfig(client, guildId),
    getTicketData(guildId, channelId)
  ]);

  // Ticket commands only run in guilds with a full GuildMember (as the JS assumed).
  const member = interaction.member as GuildMember;
  const hasManageChannels = member.permissions.has(PermissionFlagsBits.ManageChannels);
  const staffRoleId: string | null = config.ticketStaffRoleId || null;
  const hasTicketStaffRole = Boolean(staffRoleId && member.roles?.cache?.has(staffRoleId));
  const isTicketCreator = Boolean(
    ticketData?.userId && String(ticketData.userId) === String(interaction.user.id),
  );

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

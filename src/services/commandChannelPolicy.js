import { MessageFlags } from 'discord.js';
import { OWNER_INBOX_USER_ID } from './ownerInboxService.js';
import { ticketKey } from '../modules/community/store.js';
import { AccessLevel, memberAccessLevel } from '../modules/community/permissions.js';

export const COMMAND_CHANNEL_GUILD_ID = '1526671786387705907';

export const COMMAND_CHANNELS = Object.freeze({
  commands: '1527003766728167520',
  settings: '1527003886227947761',
  rankings: '1527004187093762159',
  tickets: '1527004233763786924',
  suggestions: '1527004286599430335',
  reports: '1527004367000178749',
  roles: '1526672490657484810',
  contests: '1526687290838224926',
  selfPromotion: '1526890349815926894',
  lookingForEditor: '1526890417092562964',
  lookingForTeam: '1526890571984142376',
  announcements: '1526672392313639072',
  moderation: '1526674114826342630',
  boosts: '1527374407343804566',
});

const commandDestinations = Object.freeze({
  leaderboard: 'rankings',
  profile: 'rankings',
  rank: 'rankings',
  resetxp: 'rankings',
  setxp: 'rankings',
  level: 'rankings',
  suggest: 'suggestions',
  feedback: 'suggestions',
  report: 'reports',
  editingtype: 'roles',
  role: 'roles',
  roles: 'roles',
  contest: 'contests',
  selfpromo: 'selfPromotion',
  lookingforeditor: 'lookingForEditor',
  lookingforteam: 'lookingForTeam',
  announce: 'announcements',
  embed: 'announcements',
  testboost: 'boosts',
  sticky: 'moderation',
});

const categoryDestinations = Object.freeze({
  admin: 'settings',
  moderation: 'moderation',
  tickets: 'tickets',
  roles: 'roles',
  levels: 'rankings',
  contests: 'contests',
  utility: 'announcements',
});

export function resolveCommandDestination(command) {
  return commandDestinations[command.data.name]
    || categoryDestinations[command.category]
    || 'commands';
}

function restrictedCommandAccess(interaction, command) {
  const name = command.data.name;
  if (command.category === 'owner') return AccessLevel.OWNER;
  if (command.category === 'moderation') return AccessLevel.MODERATOR;
  if (command.category === 'utility') return AccessLevel.ADMIN;
  if (command.category === 'admin') {
    if (name === 'ticket' && interaction.options?.getSubcommand?.() === 'open') return null;
    return AccessLevel.ADMIN;
  }
  if (name === 'setxp' || name === 'resetxp') return AccessLevel.ADMIN;
  if (name === 'role') return AccessLevel.MODERATOR;
  return null;
}

async function isTicketChannel(interaction, client) {
  if (interaction.channelId === COMMAND_CHANNELS.tickets) return true;
  return Boolean(await client.db.get(ticketKey(interaction.guildId, interaction.channelId), null));
}

export async function enforceCommandChannel(interaction, command, client) {
  if (interaction.user.id === OWNER_INBOX_USER_ID) return true;
  if (interaction.guildId !== COMMAND_CHANNEL_GUILD_ID) return true;

  // Run the command's own permission guard before revealing its staff channel.
  const requiredAccess = restrictedCommandAccess(interaction, command);
  if (requiredAccess !== null
    && await memberAccessLevel(interaction, client) < requiredAccess) return true;

  const destination = resolveCommandDestination(command);
  if (destination === 'tickets' && await isTicketChannel(interaction, client)) return true;

  const requiredChannelId = COMMAND_CHANNELS[destination];
  if (!requiredChannelId || interaction.channelId === requiredChannelId) return true;

  await interaction.reply({
    content: `הפקודה הזאת זמינה רק ב־<#${requiredChannelId}>.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
  return false;
}

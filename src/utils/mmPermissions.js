/**
 * Permission Utilities for Middleman System
 * 
 * Contains all permission checking functions for the MM ticket system.
 * Ensures only authorized users can perform specific actions.
 */

import { PermissionFlagsBits } from 'discord.js';
import mmConfig from '../config/mmConfig.js';

/**
 * Check if a user has the Middleman role
 * @param {import('discord.js').GuildMember} member - The guild member
 * @returns {boolean}
 */
function hasMiddlemanRole(member) {
  if (!member || !mmConfig.mmRoleId) return false;
  return member.roles.cache.has(mmConfig.mmRoleId);
}

/**
 * Check if a user has the Staff role
 * @param {import('discord.js').GuildMember} member - The guild member
 * @returns {boolean}
 */
function hasStaffRole(member) {
  if (!member || !mmConfig.staffRoleId) return false;
  return member.roles.cache.has(mmConfig.staffRoleId);
}

/**
 * Check if a user is a server administrator
 * @param {import('discord.js').GuildMember} member - The guild member
 * @returns {boolean}
 */
function isAdministrator(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Check if a user is a server moderator (ManageMessages permission)
 * @param {import('discord.js').GuildMember} member - The guild member
 * @returns {boolean}
 */
function isModerator(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages);
}

/**
 * Check if a user can manage tickets (MM, Staff, or Admin)
 * @param {import('discord.js').GuildMember} member - The guild member
 * @returns {boolean}
 */
function canManageTickets(member) {
  return hasMiddlemanRole(member) || hasStaffRole(member) || isAdministrator(member);
}

/**
 * Check if a user can close tickets (Staff or Admin only)
 * @param {import('discord.js').GuildMember} member - The guild member
 * @returns {boolean}
 */
function canCloseTickets(member) {
  return hasStaffRole(member) || isAdministrator(member);
}

/**
 * Check if a user can view a specific ticket
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {Object} ticket - The ticket document
 * @returns {boolean}
 */
function canViewTicket(member, ticket) {
  if (!member || !ticket) return false;
  
  // Staff and admins can view all tickets
  if (canManageTickets(member)) return true;
  
  // Buyer and seller can view their own tickets
  if (ticket.buyerId === member.id) return true;
  if (ticket.sellerId === member.id) return true;
  
  // Assigned middleman can view the ticket
  if (ticket.middlemanId === member.id) return true;
  
  return false;
}

/**
 * Check if a user can update ticket status
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {Object} ticket - The ticket document
 * @returns {boolean}
 */
function canUpdateStatus(member, ticket) {
  if (!member || !ticket) return false;
  
  // MM and staff can always update status
  if (canManageTickets(member)) return true;
  
  // Buyer and seller can update status only if they are participants
  if (ticket.buyerId === member.id || ticket.sellerId === member.id) {
    // But only if the ticket is open
    return !ticket.closedAt;
  }
  
  return false;
}

/**
 * Check if a user can give reputation
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {Object} ticket - The ticket document
 * @returns {boolean}
 */
function canGiveReputation(member, ticket) {
  if (!member || !ticket) return false;
  
  // Only if the trade was successful
  if (!ticket.tradeSuccessful) return false;
  
  // Only participants can give reputation
  return ticket.buyerId === member.id || ticket.sellerId === member.id;
}

/**
 * Get permission summary for a user in a ticket
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {Object} ticket - The ticket document
 * @returns {Object} Permission summary
 */
function getPermissionSummary(member, ticket) {
  return {
    isMiddleman: hasMiddlemanRole(member),
    isStaff: hasStaffRole(member),
    isAdmin: isAdministrator(member),
    isBuyer: ticket ? ticket.buyerId === member.id : false,
    isSeller: ticket ? ticket.sellerId === member.id : false,
    isAssignedMM: ticket ? ticket.middlemanId === member.id : false,
    canManage: canManageTickets(member),
    canClose: canCloseTickets(member),
    canView: ticket ? canViewTicket(member, ticket) : false,
    canUpdateStatus: ticket ? canUpdateStatus(member, ticket) : false,
    canGiveRep: ticket ? canGiveReputation(member, ticket) : false
  };
}

/**
 * Validate that a user has permission to perform an action
 * Throws an error if permission is denied
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {Object} ticket - The ticket document
 * @param {string} action - The action being performed
 * @throws {Error} If permission is denied
 */
function validatePermission(member, ticket, action) {
  const permissions = getPermissionSummary(member, ticket);
  
  switch (action) {
    case 'view':
      if (!permissions.canView) {
        throw new Error('You do not have permission to view this ticket.');
      }
      break;
      
    case 'update_status':
      if (!permissions.canUpdateStatus) {
        throw new Error('You do not have permission to update the status of this ticket.');
      }
      break;
      
    case 'close':
      if (!permissions.canClose) {
        throw new Error('Only staff members can close tickets.');
      }
      break;
      
    case 'give_reputation':
      if (!permissions.canGiveRep) {
        throw new Error('You can only give reputation for completed trades you participated in.');
      }
      break;
      
    case 'manage':
      if (!permissions.canManage) {
        throw new Error('You do not have permission to manage tickets.');
      }
      break;
      
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Check if a channel is a middleman ticket channel
 * @param {import('discord.js').Channel} channel - The channel to check
 * @param {string} guildId - The guild ID
 * @returns {boolean}
 */
function isTicketChannel(channel, guildId) {
  if (!channel || !guildId) return false;
  
  // Check if channel name starts with the ticket prefix
  if (channel.name && channel.name.startsWith(mmConfig.ticketNamePrefix)) {
    return true;
  }
  
  // Check if channel is in the MM category
  if (channel.parentId && channel.parentId === mmConfig.mmCategoryId) {
    return true;
  }
  
  return false;
}

export {
  hasMiddlemanRole,
  hasStaffRole,
  isAdministrator,
  isModerator,
  canManageTickets,
  canCloseTickets,
  canViewTicket,
  canUpdateStatus,
  canGiveReputation,
  getPermissionSummary,
  validatePermission,
  isTicketChannel
};

export default {
  hasMiddlemanRole,
  hasStaffRole,
  isAdministrator,
  isModerator,
  canManageTickets,
  canCloseTickets,
  canViewTicket,
  canUpdateStatus,
  canGiveReputation,
  getPermissionSummary,
  validatePermission,
  isTicketChannel
};
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { createTicket, closeTicket, claimTicket, updateTicketPriority } from '../services/ticket.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { logTicketEvent } from '../utils/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { getTicketPermissionContext } from '../utils/ticketPermissions.js';

// Helper function to escape HTML special characters
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function ensureGuildContext(interaction) {
  if (interaction.inGuild()) {
    return true;
  }

  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
      embeds: [errorEmbed('Guild Only', 'This action can only be used in a server.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  return false;
}

async function checkTicketPermissionWithTimeout(interaction, client, actionLabel, options = {}, timeoutMs = 2500) {
  const { allowTicketCreator = false } = options;

  try {
    const contextPromise = getTicketPermissionContext({ client, interaction });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );

    const context = await Promise.race([contextPromise, timeoutPromise]);

    if (!context.ticketData) {
      return { success: false, error: 'Not a Ticket Channel', details: 'This action can only be used in a valid ticket channel.' };
    }

    const allowed = allowTicketCreator ? context.canCloseTicket : context.canManageTicket;
    if (!allowed) {
      const permissionMessage = allowTicketCreator
        ? 'You must have **Manage Channels**, the configured **Ticket Staff Role**, or be the **ticket creator**.'
        : 'You must have **Manage Channels** or the configured **Ticket Staff Role**.';
      return { success: false, error: 'Permission Denied', details: `${permissionMessage}\n\nYou cannot ${actionLabel}.` };
    }

    return { success: true, context };
  } catch (error) {
    if (error.message === 'Timeout') {
      return { success: false, error: 'Request Timeout', details: 'The permission check took too long. Please try again.' };
    }
    return { success: false, error: 'Error', details: `Failed to check permissions: ${error.message}` };
  }
}

async function ensureTicketPermission(interaction, client, actionLabel, options = {}) {
  const { allowTicketCreator = false } = options;

  const context = await getTicketPermissionContext({ client, interaction });

  if (!context.ticketData) {
    await interaction.reply({
      embeds: [errorEmbed('Not a Ticket Channel', 'This action can only be used in a valid ticket channel.')],
      flags: MessageFlags.Ephemeral
    });
    return null;
  }

  const allowed = allowTicketCreator ? context.canCloseTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'You must have **Manage Channels**, the configured **Ticket Staff Role**, or be the **ticket creator**.'
      : 'You must have **Manage Channels** or the configured **Ticket Staff Role**.';

    await interaction.reply({
      embeds: [errorEmbed('Permission Denied', `${permissionMessage}\n\nYou cannot ${actionLabel}.`)],
      flags: MessageFlags.Ephemeral
    });
    return null;
  }

  return context;
}

const createTicketHandler = {
  name: 'create_ticket',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const rateLimitKey = `${interaction.user.id}:create_ticket`;
      const allowed = await checkRateLimit(rateLimitKey, 3, 60000);
      if (!allowed) {
        await interaction.reply({
          embeds: [errorEmbed('Rate Limited', 'You are creating tickets too quickly. Please wait a minute and try again.')],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const config = await getGuildConfig(client, interaction.guildId);
      const maxTicketsPerUser = config.maxTicketsPerUser || 3;
      
      const { getUserTicketCount } = await import('../services/ticket.js');
      const currentTicketCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
      
      if (currentTicketCount >= maxTicketsPerUser) {
        return await interaction.reply({
          embeds: [
            errorEmbed(
              '🎫 Ticket Limit Reached',
              `You have reached the maximum number of open tickets (${maxTicketsPerUser}).\n\nPlease close your existing tickets before creating a new one.\n\n**Current Tickets:** ${currentTicketCount}/${maxTicketsPerUser}`
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }
      
      const modal = new ModalBuilder()
        .setCustomId('create_ticket_modal')
        .setTitle('Create a Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Why are you creating this ticket?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe your issue...')
        .setRequired(true)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);
      
      // showModal must be called directly without defer
      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error creating ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'Could not open ticket creation form.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

const createTicketModalHandler = {
  name: 'create_ticket_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const reason = interaction.fields.getTextInputValue('reason');
      const config = await getGuildConfig(client, interaction.guildId);
      const categoryId = config.ticketCategoryId || null;
      
      const result = await createTicket(
        interaction.guild,
        interaction.member,
        categoryId,
        reason
      );
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed(
            'Ticket Created',
            `Your ticket has been created in ${result.channel}!`
          )]
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to create ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      logger.error('Error creating ticket:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while creating your ticket.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const closeTicketHandler = {
  name: 'ticket_close',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      // Use timeout-aware permission check to prevent interaction expiration
      const permissionCheck = await checkTicketPermissionWithTimeout(
        interaction,
        client,
        'close this ticket',
        { allowTicketCreator: true },
        2000 // 2 second timeout for permission checks
      );

      if (!permissionCheck.success) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed(permissionCheck.error, permissionCheck.details)],
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Close Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for closing (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add an optional reason for closing this ticket...')
        .setRequired(false)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      // showModal must be called directly without defer
      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error closing ticket:', error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'Could not open ticket close form.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

const closeTicketModalHandler = {
  name: 'ticket_close_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      // Use timeout-aware permission check 
      const permissionCheck = await checkTicketPermissionWithTimeout(
        interaction,
        client,
        'close this ticket',
        { allowTicketCreator: true },
        2000
      );

      if (!permissionCheck.success) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed(permissionCheck.error, permissionCheck.details)],
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const providedReason = interaction.fields.getTextInputValue('reason')?.trim();
      const reason = providedReason || 'Closed via ticket button without a specific reason.';

      const result = await closeTicket(interaction.channel, interaction.user, reason);

      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Closed', 'This ticket has been closed.')],
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to close ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      logger.error('Error submitting close ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'An error occurred while closing the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'An error occurred while closing the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

const claimTicketHandler = {
  name: 'ticket_claim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const permissionCheck = await checkTicketPermissionWithTimeout(
        interaction,
        client,
        'claim tickets',
        {},
        2000
      );

      if (!permissionCheck.success) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed(permissionCheck.error, permissionCheck.details)],
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const result = await claimTicket(interaction.channel, interaction.user);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Claimed', 'You have successfully claimed this ticket!')],
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to claim ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      logger.error('Error claiming ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'An error occurred while claiming the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'An error occurred while claiming the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

const priorityTicketHandler = {
  name: 'ticket_priority',
  async execute(interaction, client, args) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const permissionCheck = await checkTicketPermissionWithTimeout(
        interaction,
        client,
        'change ticket priority',
        {},
        2000
      );

      if (!permissionCheck.success) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed(permissionCheck.error, permissionCheck.details)],
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const priority = args?.[0];
      if (!priority) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Priority', 'A priority value is required.')],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const result = await updateTicketPriority(interaction.channel, priority, interaction.user);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Priority Updated', `Ticket priority set to ${priority}.`)],
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to update priority.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      logger.error('Error updating ticket priority:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'An error occurred while updating the priority.')],
          flags: MessageFlags.Ephemeral
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'An error occurred while updating the priority.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

const pinTicketHandler = {
  name: 'ticket_pin',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const permissionCheck = await checkTicketPermissionWithTimeout(
        interaction,
        client,
        'pin tickets',
        {},
        2000
      );

      if (!permissionCheck.success) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed(permissionCheck.error, permissionCheck.details)],
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const channel = interaction.channel;
      const category = channel.parent;

      if (!category) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'This ticket is not in a category.')],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Check if channel name already has ping emoji
      const hasPingEmoji = channel.name.startsWith('📌');
      
      if (hasPingEmoji) {
        // Unpin: remove emoji and update position
        const newName = channel.name.replace(/^📌\s*/, '');
        await channel.edit({ 
          name: newName,
          position: 999 // Move to end
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Ticket Unpinned',
            description: 'This ticket has been unpinned and moved back to normal position.',
            color: 0x95A5A6
          })],
          flags: MessageFlags.Ephemeral
        });

        logger.info('Ticket unpinned', {
          guildId: interaction.guildId,
          channelId: channel.id,
          channelName: newName,
          userId: interaction.user.id
        });
      } else {
        // Pin: add emoji and update position
        const newName = `📌 ${channel.name}`;
        await channel.edit({ 
          name: newName,
          position: 0 // Move to top
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Ticket Pinned',
            description: 'This ticket has been pinned to the top of the category.',
            color: 0x3498db
          })],
          flags: MessageFlags.Ephemeral
        });

        logger.info('Ticket pinned', {
          guildId: interaction.guildId,
          channelId: channel.id,
          channelName: newName,
          userId: interaction.user.id
        });
      }

      await logTicketEvent({
        client: interaction.client,
        guildId: interaction.guildId,
        event: {
          type: hasPingEmoji ? 'unpin' : 'pin',
          ticketId: channel.id,
          ticketNumber: channel.name.replace(/[^0-9]/g, ''),
          userId: interaction.user.id,
          executorId: interaction.user.id,
          metadata: {
            isPinned: !hasPingEmoji,
            newChannelName: hasPingEmoji ? channel.name.replace(/^📌\s*/, '') : `📌 ${channel.name}`
          }
        }
      });

    } catch (error) {
      logger.error('Error pinning/unpinning ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'Failed to pin/unpin the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'Failed to pin/unpin the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

const unclaimTicketHandler = {
  name: 'ticket_unclaim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const permissionCheck = await checkTicketPermissionWithTimeout(
        interaction,
        client,
        'unclaim tickets',
        {},
        2000
      );

      if (!permissionCheck.success) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed(permissionCheck.error, permissionCheck.details)],
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { unclaimTicket } = await import('../services/ticket.js');
      const result = await unclaimTicket(interaction.channel, interaction.member);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Unclaimed', 'You have successfully unclaimed this ticket!')],
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to unclaim ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      logger.error('Error unclaiming ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'An error occurred while unclaiming the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'An error occurred while unclaiming the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

const reopenTicketHandler = {
  name: 'ticket_reopen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const permissionCheck = await checkTicketPermissionWithTimeout(
        interaction,
        client,
        'reopen tickets',
        {},
        2000
      );

      if (!permissionCheck.success) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed(permissionCheck.error, permissionCheck.details)],
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { reopenTicket } = await import('../services/ticket.js');
      const result = await reopenTicket(interaction.channel, interaction.member);
      
      if (result.success) {
        let reopenMessage = 'You have successfully reopened this ticket!';
        if (result.openCategoryMoveFailed) {
          reopenMessage += '\n\n⚠️ The ticket was reopened, but it could not be moved to the configured open ticket category.';
        }

        await interaction.editReply({
          embeds: [successEmbed('Ticket Reopened', reopenMessage)],
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to reopen ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      logger.error('Error reopening ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'An error occurred while reopening the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'An error occurred while reopening the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

const deleteTicketHandler = {
  name: 'ticket_delete',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      // Use timeout-aware permission check
      const permissionCheck = await checkTicketPermissionWithTimeout(
        interaction,
        client,
        'delete tickets',
        {},
        2000
      );

      if (!permissionCheck.success) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed(permissionCheck.error, permissionCheck.details)],
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { deleteTicket } = await import('../services/ticket.js');
      const result = await deleteTicket(interaction.channel, interaction.member);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Deleted', 'This ticket will be permanently deleted in 3 seconds.')],
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to delete ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      logger.error('Error deleting ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'An error occurred while deleting the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'An error occurred while deleting the ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

export default createTicketHandler;
export { 
  createTicketModalHandler, 
  closeTicketModalHandler,
  closeTicketHandler, 
  claimTicketHandler, 
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler 
};





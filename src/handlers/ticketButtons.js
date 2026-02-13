import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { createTicket, closeTicket, claimTicket, updateTicketPriority } from '../services/ticket.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { logEvent } from '../utils/moderation.js';
import { logTicketEvent } from '../utils/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

const createTicketHandler = {
  name: 'create_ticket',
  async execute(interaction, client) {
    try {
      const config = await getGuildConfig(client, interaction.guildId);
      const categoryId = config.ticketCategoryId || null;
      const maxTicketsPerUser = config.maxTicketsPerUser || 3;
      
      const { getUserTicketCount } = await import('../services/ticket.js');
      const currentTicketCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
      const remainingTickets = maxTicketsPerUser - currentTicketCount;
      
      if (currentTicketCount >= maxTicketsPerUser) {
        return interaction.reply({
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
      
      await interaction.showModal(modal);
    } catch (error) {
      console.error('Error creating ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'Could not open ticket creation form.')],
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.followUp({
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
      console.error('Error creating ticket:', error);
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
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const result = await closeTicket(interaction.channel, interaction.user);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Closed', 'This ticket has been closed.')],
          flags: MessageFlags.Ephemeral
        });
        
        await logEvent({
          client,
          guildId: interaction.guildId,
          event: {
            action: 'Ticket Closed',
            target: interaction.channel.toString(),
            executor: interaction.user.toString(),
            reason: 'Closed via ticket button'
          }
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to close ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while closing the ticket.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const claimTicketHandler = {
  name: 'ticket_claim',
  async execute(interaction, client) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const result = await claimTicket(interaction.channel, interaction.user);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Claimed', 'You have successfully claimed this ticket!')],
          flags: MessageFlags.Ephemeral
        });
        
        await logEvent({
          client,
          guildId: interaction.guildId,
          event: {
            action: 'Ticket Claimed',
            target: interaction.channel.toString(),
            executor: interaction.user.toString()
          }
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to claim ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('Error claiming ticket:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while claiming the ticket.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const priorityTicketHandler = {
  name: 'ticket_priority',
  async execute(interaction, client, args) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const priority = args[0];
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
      console.error('Error updating ticket priority:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while updating the priority.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const transcriptTicketHandler = {
  name: 'ticket_transcript',
  async execute(interaction, client) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Total messages fetched:', messages?.size || 0);
      }
      
      if (!messages || messages.size === 0) {
        await interaction.editReply({
          embeds: [errorEmbed('No Messages', 'No messages found in this ticket channel.')],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      const messagesArray = Array.from(messages.values());
      const userMessages = messagesArray.filter(m => {
        const hasAuthor = m.author && typeof m.author === 'object';
        const hasTag = hasAuthor && m.author.tag;
const isUserMessage = m.type === 0;
        
        if (!hasAuthor) {
          if (process.env.NODE_ENV !== 'production') {
            logger.debug('Filtering message without author:', m.id, m.type);
          }
        } else if (!hasTag) {
          if (process.env.NODE_ENV !== 'production') {
            logger.debug('Message author exists but no tag:', m.id, m.author);
          }
        }
        
        return hasAuthor && hasTag && isUserMessage;
      });
      
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Filtered user messages:', userMessages?.length || 0);
      }
      const sortedMessages = userMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      
      if (!sortedMessages || sortedMessages.length === 0) {
        await interaction.editReply({
          embeds: [errorEmbed('No User Messages', 'No user messages found to include in the transcript.')],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      let htmlTranscript = `<!DOCTYPE html>
<html>
<head>
    <title>Ticket Transcript - ${interaction.channel.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .message { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #3498db; }
        .timestamp { color: #7f8c8d; font-size: 0.9em; }
        .author { font-weight: bold; color: #2c3e50; }
        .content { margin: 10px 0; }
        .attachments { background: #ecf0f1; padding: 10px; border-radius: 4px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎫 Ticket Transcript</h1>
        <p><strong>Channel:</strong> ${interaction.channel.name}</p>
        <p><strong>Created:</strong> <t:${Math.floor(interaction.channel.createdTimestamp / 1000)}:F></p>
        <p><strong>Generated:</strong> 📅 <t:${Math.floor(Date.now() / 1000)}:F></p>
        <p><strong>Messages:</strong> ${sortedMessages.length}</p>
    </div>
`;
      
      for (const message of sortedMessages) {
        if (process.env.NODE_ENV !== 'production') {
          logger.debug('Processing message:', message.id, 'Author exists:', !!message.author, 'Attachments exist:', !!message.attachments);
        }
        
        const timestamp = `<t:${Math.floor(message.createdTimestamp / 1000)}:t>`;
        const author = message.author?.tag || message.author?.username || 'Unknown User';
        const content = message.content || '*No content (embed/attachment only)*';
        
        htmlTranscript += `
    <div class="message">
        <div class="timestamp">[${timestamp}]</div>
        <div class="author">${author}</div>
        <div class="content">${content.replace(/\n/g, '<br>')}</div>`;
        
        if (message.attachments && message.attachments.size > 0) {
          htmlTranscript += `
        <div class="attachments">
            📎 Attachments: ${message.attachments.map(a => `<a href="${a.url}">${a.name}</a>`).join(', ')}
        </div>`;
        }
        
        htmlTranscript += `
    </div>`;
      }
      
      htmlTranscript += `
</body>
</html>`;
      
      const transcriptEmbed = createEmbed({
        title: `📜 Ticket Transcript - ${interaction.channel.name}`,
        description: `**Channel:** ${interaction.channel.name}\n**Created:** <t:${Math.floor(interaction.channel.createdTimestamp / 1000)}:F>\n**Generated:** 📅 <t:${Math.floor(Date.now() / 1000)}:F>\n**Messages:** ${sortedMessages.length}\n\n📎 The complete HTML transcript has been attached as a file.`,
        color: 0x3498db,
        footer: { text: `Ticket ID: ${interaction.channel.id}` }
      });
      
      const { Buffer } = await import('buffer');
      const buffer = Buffer.from(htmlTranscript, 'utf-8');
      
      try {
        await interaction.user.send({
          content: `📜 **Ticket Transcript** for \`${interaction.channel.name}\``,
          embeds: [transcriptEmbed],
          files: [{
            attachment: buffer,
            name: `ticket-transcript-${interaction.channel.name}.html`
          }]
        });
        
        await interaction.editReply({
          embeds: [{
            title: '✅ Transcript Sent',
            description: 'The ticket transcript has been sent to your DMs as both an embed and an HTML file.',
color: 4689679
          }],
          flags: MessageFlags.Ephemeral
        });
        
        await logTicketEvent({
          client: interaction.client,
          guildId: interaction.guildId,
          event: {
            type: 'transcript',
            ticketId: interaction.channel.id,
            ticketNumber: interaction.channel.name.replace(/[^0-9]/g, ''),
            userId: interaction.user.id,
            executorId: interaction.user.id,
            metadata: {
              messageCount: sortedMessages.length,
              sentToDM: true,
              transcriptSize: htmlTranscript.length
            },
            attachments: [
              new AttachmentBuilder(buffer, { name: `ticket-transcript-${interaction.channel.name}.html` })
            ]
          }
        });
      } catch (dmError) {
        console.error('Could not DM user:', dmError);
        await interaction.editReply({
          embeds: [errorEmbed('DM Failed', 'I couldn\'t send you the transcript. Please enable DMs from server members.')],
          flags: MessageFlags.Ephemeral
        });
      }
      
    } catch (error) {
      console.error('Error creating transcript:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'Failed to create ticket transcript.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const unclaimTicketHandler = {
  name: 'ticket_unclaim',
  async execute(interaction, client) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { unclaimTicket } = await import('../services/ticket.js');
      const result = await unclaimTicket(interaction.channel, interaction.member);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Unclaimed', 'You have successfully unclaimed this ticket!')],
          flags: MessageFlags.Ephemeral
        });
        
        await logEvent({
          client,
          guildId: interaction.guildId,
          event: {
            action: 'Ticket Unclaimed',
            target: interaction.channel.toString(),
            executor: interaction.user.toString()
          }
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to unclaim ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('Error unclaiming ticket:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while unclaiming the ticket.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const reopenTicketHandler = {
  name: 'ticket_reopen',
  async execute(interaction, client) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { reopenTicket } = await import('../services/ticket.js');
      const result = await reopenTicket(interaction.channel, interaction.member);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Reopened', 'You have successfully reopened this ticket!')],
          flags: MessageFlags.Ephemeral
        });
        
        await logEvent({
          client,
          guildId: interaction.guildId,
          event: {
            action: 'Ticket Reopened',
            target: interaction.channel.toString(),
            executor: interaction.user.toString()
          }
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to reopen ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('Error reopening ticket:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while reopening the ticket.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const deleteTicketHandler = {
  name: 'ticket_delete',
  async execute(interaction, client) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { deleteTicket } = await import('../services/ticket.js');
      const result = await deleteTicket(interaction.channel, interaction.member);
      
      if (result.success) {
        await interaction.editReply({
          embeds: [successEmbed('Ticket Deleted', 'This ticket will be permanently deleted in 3 seconds.')],
          flags: MessageFlags.Ephemeral
        });
        
        await logEvent({
          client,
          guildId: interaction.guildId,
          event: {
            action: 'Ticket Deleted',
            target: interaction.channel.toString(),
            executor: interaction.user.toString()
          }
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', result.error || 'Failed to delete ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('Error deleting ticket:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'An error occurred while deleting the ticket.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

export default createTicketHandler;
export { 
  createTicketModalHandler, 
  closeTicketHandler, 
  claimTicketHandler, 
  priorityTicketHandler,
  transcriptTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler 
};





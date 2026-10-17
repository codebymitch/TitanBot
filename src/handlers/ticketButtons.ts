import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { createTicket, closeTicket, claimTicket, updateTicketPriority } from '../services/ticket.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { replyUserError, ErrorTypes, handleInteractionError, createError } from '../utils/errorHandler.js';
import { getTicketPermissionContext } from '../utils/ticket/ticketPermissions.js';
import type {
  ButtonInteraction,
  GuildMember,
  ModalSubmitInteraction,
  TextChannel,
} from 'discord.js';
import type { ButtonHandler, ModalHandler, NexoClient } from '../types/index.js';

type TicketInteraction = ButtonInteraction | ModalSubmitInteraction;
type TicketPermissionContext = Awaited<ReturnType<typeof getTicketPermissionContext>>;

function escapeHtml(text: unknown): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function ensureGuildContext(interaction: TicketInteraction): Promise<boolean> {
  if (interaction.inGuild()) {
    return true;
  }

  if (!interaction.replied && !interaction.deferred) {
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diese Aktion kannst du nur auf einem Server nutzen.' });
  }

  return false;
}

async function assertTicketPermission(
  interaction: TicketInteraction,
  client: NexoClient,
  actionLabel: string,
  options: { allowTicketCreator?: boolean } = {},
  timeoutMs = 2500,
): Promise<TicketPermissionContext> {
  const { allowTicketCreator = false } = options;

  let context: TicketPermissionContext;
  try {
    const contextPromise = getTicketPermissionContext({ client, interaction });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );
    context = await Promise.race([contextPromise, timeoutPromise]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === 'Timeout') {
      throw createError(
        'Ticket permission timeout',
        ErrorTypes.RATE_LIMIT,
        'Die Berechtigungsprüfung hat zu lange gedauert. Bitte versuch es erneut.'
      );
    }
    throw createError(
      'Ticket permission check failed',
      ErrorTypes.UNKNOWN,
      `Berechtigungen konnten nicht geprüft werden: ${errorMessage}`
    );
  }

  if (!context.ticketData) {
    throw createError(
      'Not a ticket channel',
      ErrorTypes.VALIDATION,
      'Diese Aktion kannst du nur in einem gültigen Ticket-Kanal nutzen.'
    );
  }

  const allowed = allowTicketCreator ? context.canCloseTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'Du brauchst die Berechtigung **Kanäle verwalten**, die eingestellte **Ticket-Team-Rolle** oder musst das Ticket **erstellt** haben.'
      : 'Du brauchst die Berechtigung **Kanäle verwalten** oder die eingestellte **Ticket-Team-Rolle**.';
    throw createError(
      'Ticket permission denied',
      ErrorTypes.PERMISSION,
      `${permissionMessage}\n\nDu darfst ${actionLabel} nicht.`
    );
  }

  return context;
}

async function ensureTicketPermission(
  interaction: TicketInteraction,
  client: NexoClient,
  actionLabel: string,
  options: { allowTicketCreator?: boolean } = {},
): Promise<TicketPermissionContext | null> {
  const { allowTicketCreator = false } = options;

  // See assertTicketPermission: only guildId, channelId, member and user are read.
  const context = await getTicketPermissionContext({ client, interaction });

  if (!context.ticketData) {
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diese Aktion kannst du nur in einem gültigen Ticket-Kanal nutzen.' });
    return null;
  }

  const allowed = allowTicketCreator ? context.canCloseTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'Du brauchst die Berechtigung **Kanäle verwalten**, die eingestellte **Ticket-Team-Rolle** oder musst das Ticket **erstellt** haben.'
      : 'Du brauchst die Berechtigung **Kanäle verwalten** oder die eingestellte **Ticket-Team-Rolle**.';

    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `${permissionMessage}\n\nDu darfst ${actionLabel} nicht.` });
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
        await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Du erstellst Tickets zu schnell. Warte bitte eine Minute und versuch es dann erneut.' });
        return;
      }

      const config = await getGuildConfig(client, interaction.guildId!);
      const maxTicketsPerUser = config.maxTicketsPerUser || 3;
      
      const { getUserTicketCount } = await import('../services/ticket.js');
      const currentTicketCount = await getUserTicketCount(interaction.guildId!, interaction.user.id);
      
      if (currentTicketCount >= maxTicketsPerUser) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Du hast die maximale Anzahl offener Tickets erreicht (${maxTicketsPerUser}).\n\nBitte schließ deine bestehenden Tickets, bevor du ein neues erstellst.\n\n**Aktuelle Tickets:** ${currentTicketCount}/${maxTicketsPerUser}` });
      }
      
      const modal = new ModalBuilder()
        .setCustomId('create_ticket_modal')
        .setTitle('Ticket erstellen');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Warum erstellst du dieses Ticket?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Beschreib dein Anliegen...')
        .setRequired(true)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error creating ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Das Formular zum Erstellen des Tickets konnte nicht geöffnet werden.' });
      }
    }
  }
} satisfies ButtonHandler;

const createTicketModalHandler = {
  name: 'create_ticket_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const reason = interaction.fields.getTextInputValue('reason');
      const config = await getGuildConfig(client, interaction.guildId!);
      const categoryId = config.ticketCategoryId || null;
      
      const { channel } = await createTicket(
        interaction.guild!,
        interaction.member as GuildMember,
        categoryId,
        reason
      );
      await interaction.editReply({
        embeds: [successEmbed(
          'Ticket erstellt',
          `Dein Ticket wurde in ${channel} erstellt!`
        )]
      });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'button', handler: 'ticket', customId: interaction.customId });
    }
  }
} satisfies ModalHandler;

const closeTicketHandler = {
  name: 'ticket_close',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'dieses Ticket schließen', { allowTicketCreator: true }, 2000);

      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Ticket schließen');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Grund fürs Schließen (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Optional: Warum wird dieses Ticket geschlossen?')
        .setRequired(false)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error closing ticket:', error);

      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Das Formular zum Schließen des Tickets konnte nicht geöffnet werden.' });
      }
    }
  }
} satisfies ButtonHandler;

const closeTicketModalHandler = {
  name: 'ticket_close_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'dieses Ticket schließen', { allowTicketCreator: true }, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const providedReason = interaction.fields.getTextInputValue('reason')?.trim();
      const reason = providedReason || 'Über den Ticket-Button ohne Angabe eines Grundes geschlossen.';

      await closeTicket(interaction.channel as TextChannel, interaction.user, reason);
      await interaction.editReply({ embeds: [successEmbed('Ticket geschlossen', 'Dieses Ticket wurde geschlossen.')] });
    } catch (error) {
      logger.error('Error submitting close ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Schließen des Tickets ist ein Fehler aufgetreten.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Schließen des Tickets ist ein Fehler aufgetreten.' });
      }
    }
  }
} satisfies ModalHandler;

const claimTicketHandler = {
  name: 'ticket_claim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'Tickets übernehmen', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      await claimTicket(interaction.channel as TextChannel, interaction.user);
      await interaction.editReply({ embeds: [successEmbed('Ticket übernommen', 'Du hast dieses Ticket übernommen.')] });
    } catch (error) {
      logger.error('Error claiming ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Übernehmen des Tickets ist ein Fehler aufgetreten.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Übernehmen des Tickets ist ein Fehler aufgetreten.' });
      }
    }
  }
} satisfies ButtonHandler;

const priorityTicketHandler = {
  name: 'ticket_priority',
  async execute(interaction, client, args) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'die Ticket-Priorität ändern', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const priority = args?.[0];
      if (!priority) {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Eine Priorität ist erforderlich.' });
        return;
      }

      await updateTicketPriority(interaction.channel as TextChannel, priority, interaction.user);
      await interaction.editReply({ embeds: [successEmbed('Priorität aktualisiert', `Ticket-Priorität auf **${priority.toUpperCase()}** gesetzt.`)] });
    } catch (error) {
      logger.error('Error updating ticket priority:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Aktualisieren der Priorität ist ein Fehler aufgetreten.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Aktualisieren der Priorität ist ein Fehler aufgetreten.' });
      }
    }
  }
} satisfies ButtonHandler;

const pinTicketHandler = {
  name: 'ticket_pin',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'Tickets anpinnen', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const channel = interaction.channel as TextChannel;
      const category = channel.parent;

      if (!category) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieses Ticket befindet sich in keiner Kategorie.' });
        return;
      }

      const hasPingEmoji = channel.name.startsWith('📌');
      
      if (hasPingEmoji) {
        
        const newName = channel.name.replace(/^📌\s*/, '');
        await channel.edit({
          name: newName,
          position: 999 
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Ticket losgelöst',
            description: 'Dieses Ticket ist nicht mehr angepinnt und wieder an seiner normalen Position.',
            color: 0x95A5A6
          })],
          // JS also passed flags: MessageFlags.Ephemeral here; editReply cannot set it (Discord ignores it on edits).
        });

        logger.info('Ticket unpinned', {
          guildId: interaction.guildId!,
          channelId: channel.id,
          channelName: newName,
          userId: interaction.user.id
        });
      } else {
        
        const pinnedName = `📌 ${channel.name}`;
        await channel.edit({
          name: pinnedName,
          position: 0 
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Ticket angepinnt',
            description: 'Dieses Ticket wurde oben in der Kategorie angepinnt.',
            color: 0x3498db
          })],
          // JS also passed flags: MessageFlags.Ephemeral here; editReply cannot set it (Discord ignores it on edits).
        });

        logger.info('Ticket pinned', {
          guildId: interaction.guildId!,
          channelId: channel.id,
          channelName: pinnedName,
          userId: interaction.user.id
        });
      }

      await logTicketEvent({
        client: interaction.client,
        guildId: interaction.guildId!,
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
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Das Ticket konnte nicht angepinnt/losgelöst werden.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Das Ticket konnte nicht angepinnt/losgelöst werden.' });
      }
    }
  }
} satisfies ButtonHandler;

const unclaimTicketHandler = {
  name: 'ticket_unclaim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'Tickets freigeben', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { unclaimTicket } = await import('../services/ticket.js');
      await unclaimTicket(interaction.channel as TextChannel, interaction.member as GuildMember);
      await interaction.editReply({ embeds: [successEmbed('Ticket freigegeben', 'Dieses Ticket wurde freigegeben.')] });
    } catch (error) {
      logger.error('Error unclaiming ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Freigeben des Tickets ist ein Fehler aufgetreten.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Freigeben des Tickets ist ein Fehler aufgetreten.' });
      }
    }
  }
} satisfies ButtonHandler;

const reopenTicketHandler = {
  name: 'ticket_reopen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'Tickets wieder öffnen', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { reopenTicket } = await import('../services/ticket.js');
      const { movedToOpenCategory, openCategoryMoveFailed } = await reopenTicket(interaction.channel as TextChannel, interaction.member as GuildMember);
      let reopenMessage = 'Dieses Ticket wurde wieder geöffnet.';
      if (openCategoryMoveFailed) {
        reopenMessage += ' Hinweis: Der Kanal konnte nicht zurück in die Kategorie für offene Tickets verschoben werden.';
      }
      await interaction.editReply({ embeds: [successEmbed('Ticket wieder geöffnet', reopenMessage)] });
    } catch (error) {
      logger.error('Error reopening ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Wiedereröffnen des Tickets ist ein Fehler aufgetreten.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Wiedereröffnen des Tickets ist ein Fehler aufgetreten.' });
      }
    }
  }
} satisfies ButtonHandler;

const deleteTicketHandler = {
  name: 'ticket_delete',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'Tickets löschen', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { deleteTicket } = await import('../services/ticket.js');
      await deleteTicket(interaction.channel as TextChannel, interaction.member as GuildMember);
      await interaction.editReply({ embeds: [successEmbed('Ticket gelöscht', 'Dieses Ticket wird in Kürze gelöscht.')] });
    } catch (error) {
      logger.error('Error deleting ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Löschen des Tickets ist ein Fehler aufgetreten.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Löschen des Tickets ist ein Fehler aufgetreten.' });
      }
    }
  }
} satisfies ButtonHandler;

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
import { MessageFlags } from 'discord.js';
import { getConfig } from '../../community/store.js';
import {
  buildTranscript,
  getTicket,
  saveTicket,
  ticketAccess,
  ticketMessagePayload,
} from '../../../services/ticketSystemService.js';
import { EVENT_TYPES, logEvent } from '../../../services/loggingService.js';

export async function closeTicketInteraction(i, client, reason = 'לא צוינה סיבה') {
  const ticket = await getTicket(client, i.guildId, i.channelId);
  if (!ticket) {
    return i.reply({
      content: 'הפקודה הזאת זמינה רק בתוך כרטיס תמיכה.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const config = await getConfig(client, i.guildId);
  if (!await ticketAccess(i, client, ticket, { staffOnly: true })) {
    return i.reply({
      content: 'אין לך הרשאה להשתמש בכפתורי ניהול הכרטיס. רק צוות התמיכה יכול לבצע פעולה זו.',
      flags: MessageFlags.Ephemeral,
    });
  }

  ticket.status = 'closing';
  ticket.closedAt = Date.now();
  ticket.closedBy = i.user.id;
  ticket.closeReason = reason;
  let transcript = null;
  if (config.tickets.transcriptsEnabled) {
    try {
      transcript = await buildTranscript(i.channel);
      const destination = i.guild.channels.cache.get(
        config.tickets.transcriptChannelId || config.tickets.logsChannelId,
      );
      if (destination?.isTextBased()) {
        const sent = await destination.send({
          content: `תמלול כרטיס #${ticket.id}`,
          files: [transcript],
        });
        ticket.transcriptLocation = sent.url;
        transcript = await buildTranscript(i.channel);
      }
    } catch {
      ticket.transcriptLocation = 'failed';
    }
  }
  await saveTicket(client, ticket);

  const opening = ticket.openingMessageId
    ? await i.channel.messages.fetch(ticket.openingMessageId).catch(() => null)
    : null;
  if (opening) await opening.edit(ticketMessagePayload(ticket, { disabled: true }));
  await logEvent({
    client,
    guildId: i.guildId,
    eventType: EVENT_TYPES.TICKET_CLOSE,
    data: {
      title: `כרטיס #${ticket.id} נסגר`,
      description: `נסגר על ידי ${i.user}. סיבה: ${reason}`,
    },
  });
  if (config.tickets.dmNotifications) {
    const creator = await client.users.fetch(ticket.creatorId).catch(() => null);
    await creator?.send(`כרטיס #${ticket.id} נסגר. סיבה: ${reason}`).catch(() => null);
  }
  await i.update?.({
    content: `הכרטיס נסגר. ${config.tickets.archiveEnabled ? 'הערוץ יועבר לארכיון' : 'הערוץ יימחק'} בעוד ${config.tickets.closeDelaySeconds} שניות.`,
    embeds: [],
    components: [],
  }).catch?.(() => null);

  setTimeout(async () => {
    ticket.status = 'closed';
    await saveTicket(client, ticket);
    if (config.tickets.archiveEnabled && config.tickets.archiveCategoryId) {
      await i.channel.setParent(config.tickets.archiveCategoryId, { lockPermissions: true })
        .catch(() => null);
      await i.channel.permissionOverwrites.edit(ticket.creatorId, { SendMessages: false })
        .catch(() => null);
    } else {
      await i.channel.delete(`Ticket #${ticket.id} closed`).catch(() => null);
    }
  }, config.tickets.closeDelaySeconds * 1000);
}

export default {
  name: 'ticket_close',
  async execute(i, client) {
    return closeTicketInteraction(i, client);
  },
};

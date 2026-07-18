import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getConfig } from '../../community/store.js';
import {
  buildTranscript,
  getTicket,
  saveTicket,
  ticketAccess,
  ticketMessagePayload,
} from '../../../services/ticketSystemService.js';
import { EVENT_TYPES, logEvent } from '../../../services/loggingService.js';

const denied = i => i.reply({
  content: 'אין לך הרשאה להשתמש בכפתורי ניהול הכרטיס. רק צוות התמיכה יכול לבצע פעולה זו.',
  flags: MessageFlags.Ephemeral,
});

const field = (id, label, style = TextInputStyle.Short, required = true) => new ActionRowBuilder()
  .addComponents(new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(500));

const action = {
  name: 'ticket_action',
  async execute(i, client, args) {
    const actionName = args[0];
    const ticket = await getTicket(client, i.guildId, i.channelId);
    if (!ticket) {
      return i.reply({
        content: 'הכפתור זמין רק בתוך כרטיס תמיכה.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!await ticketAccess(i, client, ticket, { staffOnly: true })) return denied(i);

    if (['close', 'add', 'remove', 'rename'].includes(actionName)) {
      const modal = new ModalBuilder()
        .setCustomId(`ticket_action_form:${actionName}`)
        .setTitle('ניהול כרטיס תמיכה');
      modal.addComponents(field(
        actionName === 'close' ? 'reason' : actionName === 'rename' ? 'name' : 'member',
        actionName === 'close' ? 'סיבת הסגירה' : actionName === 'rename' ? 'שם חדש לערוץ' : 'מזהה המשתמש',
        TextInputStyle.Short,
        actionName !== 'close',
      ));
      return i.showModal(modal);
    }

    if (actionName === 'transcript') {
      return i.reply({
        content: 'התמלול נוצר באופן פרטי.',
        files: [await buildTranscript(i.channel)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (actionName === 'claim') {
      if (ticket.assignedStaffId && ticket.assignedStaffId !== i.user.id) {
        return i.reply({
          content: 'הכרטיס כבר נלקח על ידי איש צוות אחר.',
          flags: MessageFlags.Ephemeral,
        });
      }
      ticket.assignedStaffId = i.user.id;
      ticket.status = 'claimed';
      await saveTicket(client, ticket);
      await i.message.edit(ticketMessagePayload(ticket));
      return i.reply({
        content: `הכרטיס נלקח על ידי ${i.user}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const config = await getConfig(client, i.guildId);
    const last = Number(ticket.lastStaffAlertAt || 0);
    if (Date.now() - last < config.tickets.staffAlertCooldownSeconds * 1000) {
      return i.reply({
        content: 'יש להמתין לפני הזעקת הצוות שוב.',
        flags: MessageFlags.Ephemeral,
      });
    }
    ticket.lastStaffAlertAt = Date.now();
    ticket.lastStaffAlertBy = i.user.id;
    await saveTicket(client, ticket);
    await i.channel.send({
      content: `<@&${config.tickets.supportRoleId}> נדרשת עזרת צוות בכרטיס #${ticket.id}.`,
      allowedMentions: { roles: [config.tickets.supportRoleId] },
    });
    await logEvent({
      client,
      guildId: i.guildId,
      eventType: EVENT_TYPES.TICKET_CLAIM,
      data: {
        title: `הזעקת צוות בכרטיס #${ticket.id}`,
        description: `הופעלה על ידי ${i.user}.`,
      },
    });
    return i.reply({
      content: 'צוות התמיכה הוזעק.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

const confirm = {
  name: 'ticket_close_confirm',
  async execute(i, client, args) {
    const reason = Buffer.from(args[0] || '', 'base64url').toString('utf8') || 'לא צוינה סיבה';
    const { closeTicketInteraction } = await import('./ticket_close.js');
    return closeTicketInteraction(i, client, reason);
  },
};

const cancel = {
  name: 'ticket_close_cancel',
  async execute(i) {
    return i.update({ content: 'הסגירה בוטלה.', embeds: [], components: [] });
  },
};

const panelDelete = {
  name: 'ticket_panel_delete',
  async execute(i, client, args) {
    const [id, userId] = args;
    if (i.user.id !== userId) {
      return i.reply({
        content: 'רק מי שביקש את המחיקה יכול לאשר.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const key = `community:${i.guildId}:ticketpanel:${id}`;
    const panel = await client.db.get(key);
    if (!panel) return i.update({ content: 'לוח הכרטיסים לא נמצא.', components: [] });
    const config = await getConfig(client, i.guildId);
    const channel = i.guild.channels.cache.get(panel.channelId);
    const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
    await message?.delete().catch(() => null);
    await client.db.delete(key);
    const { updateConfig } = await import('../../community/store.js');
    await updateConfig(client, i.guildId, {
      tickets: { panels: (config.tickets.panels || []).filter(value => value !== id) },
    });
    return i.update({
      content: `לוח #${id} נמחק. כרטיסים קיימים נשמרו.`,
      components: [],
    });
  },
};

export default [action, confirm, cancel, panelDelete];

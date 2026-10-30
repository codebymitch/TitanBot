import { MessageFlags } from 'discord.js';
import {
    TICKET_BUTTON_PREFIX, TICKET_FAILURE_TEXT, openTicket, claimTicket, closeTicket, verifyTicket, ticketControls,
} from '../../../services/tickets/homeTickets.js';
import { isHomeGuild } from '../../../config/homeGuild.js';

// The buttons of our server's tickets (services/tickets/homeTickets.js): `hticket:open:<type>` on the
// panel, and `hticket:claim|close|verify` inside a ticket.
const privately = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(() => {});

async function execute(interaction, client, [action, type]) {
    if (!interaction.inGuild()) return;
    if (!isHomeGuild(interaction.guildId)) return privately(interaction, TICKET_FAILURE_TEXT.not_home);
    const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return;

    if (action === 'open') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const result = await openTicket(member, type);
        const content = result.ok
            ? `✅ اتفتحلك تكت: <#${result.channel.id}>`
            : `${TICKET_FAILURE_TEXT[result.reason]}${result.channelId ? ` <#${result.channelId}>` : ''}`;
        return interaction.editReply({ content }).catch(() => {});
    }

    if (action === 'claim') {
        const result = await claimTicket(interaction.channel, member);
        if (!result.ok) return privately(interaction, TICKET_FAILURE_TEXT[result.reason]);
        await interaction.update({ components: ticketControls(result.ticket.type, { claimedBy: member.id }) }).catch(() => {});
        return interaction.channel.send({ content: `🙋 <@${member.id}> استلم التكت.`, allowedMentions: { parse: [] } }).catch(() => {});
    }

    if (action === 'verify') {
        const result = await verifyTicket(interaction.channel, member);
        if (!result.ok) return privately(interaction, TICKET_FAILURE_TEXT[result.reason]);
        return interaction.reply({ content: `✅ <@${result.ticket.ownerId}> اتوثقت وخدت <@&${result.roleId}> 🎀`, allowedMentions: { users: [result.ticket.ownerId] } }).catch(() => {});
    }

    if (action === 'close') {
        const result = await closeTicket(interaction.channel, member);
        if (!result.ok) return privately(interaction, TICKET_FAILURE_TEXT[result.reason]);
        return interaction.deferUpdate().catch(() => {});
    }
}

export default { name: TICKET_BUTTON_PREFIX, execute };

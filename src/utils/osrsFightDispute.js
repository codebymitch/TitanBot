import { getGuildConfig } from '../services/guildConfig.js';
import { createTicket } from '../services/ticket.js';
import { createFightDisputeResolutionRow, createFightDisputeTicketEmbed } from './osrsStakingPresentation.js';
import { logger } from './logger.js';

const TICKET_PARTICIPANT_PERMISSIONS = {
    ViewChannel: true,
    SendMessages: true,
    AttachFiles: true,
    ReadMessageHistory: true,
};

function buildTicketReason(fight) {
    return [
        `Fight Dispute - ${fight.challengerOsrsUsername || fight.challenger_id} vs ${fight.opponentOsrsUsername || fight.opponent_id}`,
        `Fight ID: ${fight.id}`,
        `Stake: ${fight.amount} gp`,
        `Challenger confirmed: ${fight.challengerConfirmed || 'pending'}`,
        `Opponent confirmed: ${fight.opponentConfirmed || 'pending'}`,
        'Status: Awaiting staff review',
    ].join('\n');
}

async function grantTicketAccess(channel, userId) {
    await channel.permissionOverwrites.edit(userId, TICKET_PARTICIPANT_PERMISSIONS);
}

export async function createFightDisputeTicket(client, guild, member, fight) {
    try {
        const config = await getGuildConfig(client, guild.id);
        const categoryId = config.ticketCategoryId || null;
        const ticketOwner = member || await guild.members.fetch(fight.challenger_id).catch(() => null);
        if (!ticketOwner) {
            return null;
        }

        const result = await createTicket(guild, ticketOwner, categoryId, buildTicketReason(fight));
        if (!result.success || !result.channel) {
            return null;
        }

        const accessResults = await Promise.allSettled([
            grantTicketAccess(result.channel, fight.challenger_id),
            grantTicketAccess(result.channel, fight.opponent_id),
        ]);

        accessResults.forEach((resultEntry, index) => {
            if (resultEntry.status === 'rejected') {
                const userId = index === 0 ? fight.challenger_id : fight.opponent_id;
                logger.warn('[OSRS_FIGHT_DISPUTE] Failed to grant fighter access to dispute ticket', {
                    fightId: fight.id,
                    channelId: result.channel.id,
                    userId,
                    error: resultEntry.reason?.message || String(resultEntry.reason),
                });
            }
        });

        const staffMention = config.ticketStaffRoleId ? ` <@&${config.ticketStaffRoleId}>` : '';
        await result.channel.send({
            content: `<@${fight.challenger_id}> <@${fight.opponent_id}>${staffMention}`,
            embeds: [createFightDisputeTicketEmbed(fight)],
            components: [createFightDisputeResolutionRow(fight.id)],
            allowedMentions: {
                users: [fight.challenger_id, fight.opponent_id],
                roles: config.ticketStaffRoleId ? [config.ticketStaffRoleId] : [],
            },
        });

        return result.channel;
    } catch (error) {
        logger.warn('[OSRS_FIGHT_DISPUTE] Failed to create dispute ticket', {
            fightId: fight.id,
            error: error.message,
        });
        return null;
    }
}

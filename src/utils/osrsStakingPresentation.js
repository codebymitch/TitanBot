import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { formatCurrency } from './economy.js';
import { createEmbed } from './embeds.js';

function getFightPayouts(fight) {
    if (typeof fight?.challengerPayout === 'number' && typeof fight?.opponentPayout === 'number') {
        return {
            challengerPayout: fight.challengerPayout,
            opponentPayout: fight.opponentPayout,
        };
    }

    if (fight?.status === 'cancelled' || fight?.disputeResolution === 'refund_both') {
        return {
            challengerPayout: fight?.amount || 0,
            opponentPayout: fight?.amount || 0,
        };
    }

    return {
        challengerPayout: fight?.winner_id === fight?.challenger_id ? (fight?.amount || 0) * 2 : 0,
        opponentPayout: fight?.winner_id === fight?.opponent_id ? (fight?.amount || 0) * 2 : 0,
    };
}

export function getFightResolutionLabel(fight) {
    switch (fight?.disputeResolution) {
    case 'pay_challenger':
        return '💰 Pay Challenger';
    case 'pay_opponent':
        return '💰 Pay Opponent';
    case 'refund_both':
        return '♻️ Refund Both';
    default:
        if (fight?.status === 'cancelled') {
            return '♻️ Refund Both';
        }

        if (fight?.winner_id === fight?.challenger_id) {
            return '💰 Pay Challenger';
        }

        if (fight?.winner_id === fight?.opponent_id) {
            return '💰 Pay Opponent';
        }

        return 'Pending';
    }
}

export function formatFightPayoutSummary(fight) {
    const { challengerPayout, opponentPayout } = getFightPayouts(fight);
    return [
        `<@${fight.challenger_id}>: ${formatCurrency(challengerPayout, { short: true })}`,
        `<@${fight.opponent_id}>: ${formatCurrency(opponentPayout, { short: true })}`,
    ].join('\n');
}

export function createFightActionRow(fightId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fight:accept:${fightId}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`fight:decline:${fightId}`)
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

export function createFightResultConfirmationRow(fightId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fight_result:accept:${fightId}`)
            .setLabel('✅ Accept')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`fight_result:decline:${fightId}`)
            .setLabel('❌ Decline')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

export function createFightDisputeResolutionRow(fightId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fight_dispute_resolve:pay_challenger:${fightId}`)
            .setLabel('💰 Pay Challenger')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`fight_dispute_resolve:pay_opponent:${fightId}`)
            .setLabel('💰 Pay Opponent')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`fight_dispute_resolve:refund_both:${fightId}`)
            .setLabel('♻️ Refund Both')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
    );
}

export function createLinkApprovalRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`osrs_link:approve:${userId}`)
            .setLabel('✅ Approve')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`osrs_link:decline:${userId}`)
            .setLabel('❌ Decline')
            .setStyle(ButtonStyle.Danger),
    );
}

export function createRemovalApprovalRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`osrs_removal:approve:${userId}`)
            .setLabel('✅ Approve Removal')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`osrs_removal:decline:${userId}`)
            .setLabel('❌ Decline Removal')
            .setStyle(ButtonStyle.Danger),
    );
}

export function createFightChallengeEmbed(fight) {
    return createEmbed({
        title: 'OSRS Fight Challenge',
        description: `<@${fight.opponent_id}>, <@${fight.challenger_id}> has challenged you to an OSRS stake fight.`,
        color: 'warning',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Stake Per Fighter', value: formatCurrency(fight.amount, { short: true }), inline: true },
            { name: 'Escrow Pot', value: formatCurrency(fight.amount * 2, { short: true }), inline: true },
            { name: 'Challenger OSRS', value: fight.challengerOsrsUsername || 'Unknown', inline: true },
            { name: 'Opponent OSRS', value: fight.opponentOsrsUsername || 'Unknown', inline: true },
            { name: 'Accept By', value: `<t:${Math.floor(new Date(fight.expiresAt).getTime() / 1000)}:R>`, inline: false },
        ],
        footer: 'Accepting starts a 5-minute fight timer',
    });
}

export function createFightActiveEmbed(fight) {
    return createEmbed({
        title: 'OSRS Fight Active',
        description: `<@${fight.challenger_id}> vs <@${fight.opponent_id}> is now live.`,
        color: 'success',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Stake', value: formatCurrency(fight.amount, { short: true }), inline: true },
            { name: 'Pot', value: formatCurrency(fight.amount * 2, { short: true }), inline: true },
            { name: `Opponent for <@${fight.challenger_id}>`, value: fight.opponentOsrsUsername || 'Unknown', inline: false },
            { name: `Opponent for <@${fight.opponent_id}>`, value: fight.challengerOsrsUsername || 'Unknown', inline: false },
            { name: 'Resolve By', value: `<t:${Math.floor(new Date(fight.expiresAt).getTime() / 1000)}:R>`, inline: false },
        ],
        footer: 'Use /fight-results to confirm the outcome',
    });
}

export function createFightCancelledEmbed(fight, reason) {
    return createEmbed({
        title: 'OSRS Fight Cancelled',
        description: reason,
        color: 'error',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Stake Refunded', value: formatCurrency(fight.amount, { short: true }), inline: true },
        ],
    });
}

export function createFightConfirmedEmbed(fight, confirmerId, confirmation) {
    const label = confirmation === 'accept' ? '✅ Win Claimed' : '❌ Loss Accepted';
    return createEmbed({
        title: 'Fight Result Recorded',
        description: `<@${confirmerId}> has confirmed: **${label}**.\nThe other fighter can use the buttons below, \`/fight-results\`, or the Dink webhook to finish the outcome.`,
        color: 'info',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Pot', value: formatCurrency(fight.amount * 2, { short: true }), inline: true },
        ],
    });
}

export function createFightReportedEmbed(fight, winnerId) {
    return createEmbed({
        title: 'Fight Result Reported',
        description: `A win has been reported for <@${winnerId}>.`,
        color: 'info',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Pot', value: formatCurrency(fight.amount * 2, { short: true }), inline: true },
            { name: 'Auto Resolve', value: `Webhook confirmation or <t:${Math.floor(new Date(fight.expiresAt).getTime() / 1000)}:R>`, inline: false },
        ],
    });
}

export function createFightCompletedEmbed(fight) {
    return createEmbed({
        title: 'OSRS Fight Resolved',
        description: `<@${fight.winner_id}> won the OSRS stake fight.`,
        color: 'success',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Winner Paid', value: formatCurrency(fight.amount * 2, { short: true }), inline: true },
            { name: 'Resolution', value: fight.resolutionSource || 'manual', inline: true },
        ],
    });
}

export function createFightDisputeEmbed(fight, ticketChannelId) {
    return createEmbed({
        title: '⚠️ Fight Dispute — Ticket Created',
        description: [
            'Conflicting results were submitted for this fight.',
            'Both fighters\' confirmations do not match — a support ticket has been auto-created for manual review.',
            ticketChannelId ? `📋 **Ticket:** <#${ticketChannelId}>` : null,
            'Funds remain in escrow until staff resolve the ticket.',
        ].filter(Boolean).join('\n\n'),
        color: 'error',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Escrowed Pot', value: formatCurrency(fight.amount * 2, { short: true }), inline: true },
            { name: 'Challenger', value: `<@${fight.challenger_id}> (${fight.challengerOsrsUsername || 'Unknown'})`, inline: false },
            { name: 'Opponent', value: `<@${fight.opponent_id}> (${fight.opponentOsrsUsername || 'Unknown'})`, inline: false },
        ],
    });
}

export function createFightDisputeTicketEmbed(fight) {
    return createEmbed({
        title: `⚠️ Fight Dispute — ${fight.challengerOsrsUsername || 'Challenger'} vs ${fight.opponentOsrsUsername || 'Opponent'}`,
        description: 'Both fighters submitted conflicting results. Staff will review the dispute and decide how to distribute the escrowed funds.',
        color: 'error',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Escrowed Pot', value: formatCurrency(fight.amount * 2, { short: true }), inline: true },
            { name: 'Challenger', value: `<@${fight.challenger_id}> (${fight.challengerOsrsUsername || 'Unknown'})`, inline: false },
            { name: 'Opponent', value: `<@${fight.opponent_id}> (${fight.opponentOsrsUsername || 'Unknown'})`, inline: false },
            { name: 'Challenger Confirmed', value: fight.challengerConfirmed || 'pending', inline: true },
            { name: 'Opponent Confirmed', value: fight.opponentConfirmed || 'pending', inline: true },
            { name: 'Staff Resolution', value: 'Choose **Pay Challenger**, **Pay Opponent**, or **Refund Both** below.', inline: false },
        ],
    });
}

export function createFightDisputeResolvedEmbed(fight, resolverId) {
    return createEmbed({
        title: '✅ Fight Dispute Resolved',
        description: `**${getFightResolutionLabel(fight)}** was selected for this dispute.`,
        color: fight.disputeResolution === 'refund_both' || fight.status === 'cancelled' ? 'warning' : 'success',
        fields: [
            { name: 'Fight ID', value: fight.id, inline: true },
            { name: 'Resolved By', value: `<@${resolverId}>`, inline: true },
            {
                name: 'Resolved At',
                value: fight.disputeResolvedAt ? `<t:${Math.floor(new Date(fight.disputeResolvedAt).getTime() / 1000)}:F>` : 'Just now',
                inline: false,
            },
            { name: 'Payout Summary', value: formatFightPayoutSummary(fight), inline: false },
        ],
    });
}

export function formatFightSummaryLine(fight, userId) {
    const opponentId = fight.challenger_id === userId ? fight.opponent_id : fight.challenger_id;
    const statusLabels = {
        active: 'Active',
        pending: 'Pending',
        completed: 'Won/Lost',
        cancelled: 'Cancelled',
        ticket_required: 'Under Review',
    };
    const statusLabel = statusLabels[fight.status] || fight.status;
    const outcome = fight.winner_id
        ? (fight.winner_id === userId ? ' — You won' : ' — You lost')
        : '';

    return `**${fight.id}** • vs <@${opponentId}> • ${formatCurrency(fight.amount, { short: true })} • ${statusLabel}${outcome}`;
}

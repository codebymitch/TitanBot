import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { formatCurrency } from './economy.js';
import { createEmbed } from './embeds.js';

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
        footer: 'Accepting starts a 10-minute fight timer',
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

export function formatFightSummaryLine(fight, userId) {
    const opponentId = fight.challenger_id === userId ? fight.opponent_id : fight.challenger_id;
    const statusLabels = {
        active: 'Active',
        pending: 'Pending',
        completed: 'Won/Lost',
        cancelled: 'Cancelled',
    };
    const statusLabel = statusLabels[fight.status] || fight.status;
    const outcome = fight.winner_id
        ? (fight.winner_id === userId ? ' — You won' : ' — You lost')
        : '';

    return `**${fight.id}** • vs <@${opponentId}> • ${formatCurrency(fight.amount, { short: true })} • ${statusLabel}${outcome}`;
}

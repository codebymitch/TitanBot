import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import type { EconomyData } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;

const SLUT_ACTIVITIES = [
    { name: "Cam-Stream", min: 120, max: 450, risk: 0.2 },
    { name: "Private Tanz-Session", min: 220, max: 700, risk: 0.25 },
    { name: "Nachtclub-Host", min: 320, max: 900, risk: 0.3 },
    { name: "VIP-Begleitbuchung", min: 550, max: 1400, risk: 0.35 },
    { name: "Exklusiver Livestream", min: 850, max: 2200, risk: 0.4 },
];

const POSITIVE_OUTCOMES = [
    "Dein Stream ging durch die Decke und das Trinkgeld floss nur so.",
    "Eine VIP-Buchung hat weit über dem Durchschnitt gezahlt.",
    "Deine Nachtschicht war voll und hat sich richtig gelohnt.",
    "Premium-Anfragen kamen rein und deine Auszahlung ist gestiegen.",
];

const FINE_OUTCOMES = [
    "Die Security vor Ort hat dir ein Bußgeld verpasst.",
    "Ein Moderations-Strike hat eine Plattformgebühr ausgelöst.",
    "Du wurdest gemeldet und musstest eine Strafe zahlen.",
];

const ROBBED_OUTCOMES = [
    "Die Rückbuchung eines Fake-Käufers hat einen Teil deiner Einnahmen gekostet.",
    "Eine Betrugsbuchung hat dir einen Batzen Geld abgeknöpft.",
    "Du bist auf einen Fake-Account reingefallen und hast Geld verloren.",
];

const LOSS_OUTCOMES = [
    "Der Auftritt war ein Flop und du musstest die Kosten selbst tragen.",
    "Du hast Geld in die Vorbereitung gesteckt und nichts zurückbekommen.",
    "Die Schicht lief schief und du bist im Minus gelandet.",
];

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity: typeof SLUT_ACTIVITIES[number], wallet: number) {
    const successChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    if (roll < successChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `${activity.name} – Auszahlung`
        };
    }

    const remainingAfterSuccess = roll - successChance;

    if (remainingAfterSuccess < fineChance) {
        const maxFine = Math.min(wallet, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `${activity.name} – Strafe`
        };
    }

    if (remainingAfterSuccess < fineChance + robbedChance) {
        const maxRobbed = Math.min(wallet, Math.max(200, Math.floor(wallet * 0.35)));
        const minRobbed = Math.min(maxRobbed, Math.max(75, Math.floor(wallet * 0.1)));
        const amount = maxRobbed > 0 ? randomInt(minRobbed, maxRobbed) : 0;
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `${activity.name} – Abgezockt`
        };
    }

    const maxLoss = Math.min(wallet, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `${activity.name} – Verlust`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('Nimm einen riskanten, anrüchigen Job an – Gewinn oder Verlust per Zufall'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const now = Date.now();

            logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

            const userData: EconomyData & { lastSlut?: number; totalSluts?: number; totalSlutEarnings?: number; totalSlutLosses?: number; failedSluts?: number } = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw createError(
                    "Failed to load economy data for slut command",
                    ErrorTypes.DATABASE,
                    "Deine Wirtschaftsdaten konnten nicht geladen werden. Bitte versuch es später erneut.",
                    { userId, guildId }
                );
            }

            const lastSlut = userData.lastSlut || 0;

            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = lastSlut + SLUT_COOLDOWN - now;
                throw createError(
                    "Slut cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Du musst noch warten, bevor du wieder arbeiten kannst! Versuch es in **${Math.ceil(remainingTime / 60000)}** Minuten erneut.`,
                    { timeRemaining: remainingTime, cooldownType: 'slut' }
                );
            }

            const activity = randomChoice(SLUT_ACTIVITIES);

            const outcome = resolveOutcome(activity, userData.wallet || 0);

            userData.lastSlut = now;
            userData.totalSluts = (userData.totalSluts || 0) + 1;
            userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
            userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

            if (outcome.type !== 'payout') {
                userData.failedSluts = (userData.failedSluts || 0) + 1;
            }

            userData.wallet = Math.max(0, (userData.wallet || 0) + outcome.delta);

            await setEconomyData(client, guildId, userId, userData);

            logger.info(`[ECONOMY_TRANSACTION] Slut activity resolved`, {
                userId,
                guildId,
                activity: activity.name,
                outcomeType: outcome.type,
                amountDelta: outcome.delta,
                newWallet: userData.wallet,
                timestamp: new Date().toISOString()
            });

            const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
            const summaryLines = [
                `${outcome.message}`,
                `💸 **Ergebnis:** ${amountLabel}`,
                `💳 **Aktueller Kontostand:** $${userData.wallet.toLocaleString()}`,
                `📊 **Jobs gesamt:** ${userData.totalSluts}`,
                `💵 **Gesamt verdient:** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
                `🧾 **Gesamt verloren:** $${(userData.totalSlutLosses || 0).toLocaleString()}`
            ];

            const embed = createEmbed({
                title: outcome.title,
                description: summaryLines.join('\n'),
                color: outcome.delta >= 0 ? 'success' : 'error',
                timestamp: true
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'slut' })
} satisfies Command;

import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 45 * 60 * 1000;
const JAIL_TIME = 60 * 60 * 1000;

// NPC cars by tier. Higher tier = more pay + more heat.
const CARS = [
    { name: 'Karin Sultan',     tier: 1, min: 1500,  max: 3000,  risk: 0.25 },
    { name: 'Bravado Buffalo',  tier: 1, min: 1800,  max: 3500,  risk: 0.25 },
    { name: 'Declasse Tornado', tier: 1, min: 1200,  max: 2500,  risk: 0.20 },
    { name: 'Vapid Dominator',  tier: 2, min: 3000,  max: 6000,  risk: 0.35 },
    { name: 'Obey Tailgater',   tier: 2, min: 3500,  max: 6500,  risk: 0.35 },
    { name: 'Bravado Banshee',  tier: 3, min: 6000,  max: 12000, risk: 0.45 },
    { name: 'Pegassi Infernus', tier: 4, min: 12000, max: 22000, risk: 0.55 },
    { name: 'Truffade Adder',   tier: 4, min: 18000, max: 30000, risk: 0.60 },
    { name: 'Pegassi Zentorno', tier: 5, min: 25000, max: 45000, risk: 0.70 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('chopshop')
        .setDescription('Steal an NPC car and run it to the chop shop'),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (userData.jailedUntil && userData.jailedUntil > now) {
            const m = Math.ceil((userData.jailedUntil - now) / 60000);
            throw createError('Jailed', ErrorTypes.RATE_LIMIT, `You're locked up for ${m} more minutes.`);
        }

        const last = userData.cooldowns?.chopshop || 0;
        if (now < last + COOLDOWN) {
            const m = Math.ceil((last + COOLDOWN - now) / 60000);
            throw createError('Cooldown', ErrorTypes.RATE_LIMIT, `Heat's still on. Wait ${m} more minutes.`);
        }

        const car = CARS[Math.floor(Math.random() * CARS.length)];
        const success = Math.random() > car.risk;

        userData.cooldowns = userData.cooldowns || {};
        userData.cooldowns.chopshop = now;

        if (success) {
            const payout = Math.floor(Math.random() * (car.max - car.min + 1)) + car.min;
            userData.wallet = (userData.wallet || 0) + payout;
            await setEconomyData(client, guildId, userId, userData);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    '🔧 Chop Shop Payout',
                    `You boosted a **${car.name}** (Tier ${car.tier}) and dropped it at the chop shop.\nPaid out: **$${payout.toLocaleString()}**`
                )]
            });
        } else {
            const fine = Math.floor(car.min * 0.5);
            userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
            userData.jailedUntil = now + JAIL_TIME;
            await setEconomyData(client, guildId, userId, userData);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    '🚓 Busted',
                    `LSPD caught you boosting a **${car.name}**. Fined **$${fine.toLocaleString()}** and jailed for 1 hour.`
                )]
            });
        }
    }, { command: 'chopshop' })
};

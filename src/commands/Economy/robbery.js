import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 90 * 60 * 1000;
const JAIL_TIME = 2 * 60 * 60 * 1000;

const TARGETS = [
    { name: 'LTD Gas Station',   min: 500,   max: 1500,  risk: 0.30 },
    { name: 'Liquor Store',      min: 800,   max: 2500,  risk: 0.35 },
    { name: '24/7 Convenience',  min: 1200,  max: 3500,  risk: 0.40 },
    { name: 'Jewelry Store',     min: 5000,  max: 15000, risk: 0.60 },
    { name: 'Pacific Standard Bank', min: 15000, max: 40000, risk: 0.80 },
];

// Weapon multipliers — owning the gun lowers risk & boosts payout
const WEAPONS = [
    { id: 'bm_rifle',  name: 'Assault Rifle', mult: 2.0, riskCut: 0.30 },
    { id: 'bm_smg',    name: 'SMG',           mult: 1.5, riskCut: 0.20 },
    { id: 'bm_pistol', name: 'Pistol',        mult: 1.2, riskCut: 0.10 },
];

function findBestWeapon(inv = []) {
    for (const w of WEAPONS) {
        if (inv.find(i => i.id === w.id && (i.quantity || 1) > 0)) return w;
    }
    return null;
}

export default {
    data: new SlashCommandBuilder()
        .setName('robbery')
        .setDescription('Armed robbery (211 in progress). Payout scales with your weapon.')
        .addStringOption(o => o
            .setName('target')
            .setDescription('What you hitting?')
            .setRequired(true)
            .addChoices(
                { name: 'LTD Gas Station',    value: 'ltd' },
                { name: 'Liquor Store',       value: 'liquor' },
                { name: '24/7 Convenience',   value: '247' },
                { name: 'Jewelry Store',      value: 'jewelry' },
                { name: 'Pacific Standard Bank', value: 'bank' },
            )),

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

        const last = userData.cooldowns?.robbery || 0;
        if (now < last + COOLDOWN) {
            const m = Math.ceil((last + COOLDOWN - now) / 60000);
            throw createError('Cooldown', ErrorTypes.RATE_LIMIT, `Cool it. Try again in ${m} minutes.`);
        }

        const map = { ltd: 0, liquor: 1, '247': 2, jewelry: 3, bank: 4 };
        const target = TARGETS[map[interaction.options.getString('target')]];

        const weapon = findBestWeapon(userData.inventory || []);
        if (!weapon) {
            throw createError('Unarmed', ErrorTypes.VALIDATION,
                'No gun in your inventory. Hit `/shop` and get a black market piece first.');
        }

        const finalRisk = Math.max(0.05, target.risk - weapon.riskCut);
        const success = Math.random() > finalRisk;

        userData.cooldowns = userData.cooldowns || {};
        userData.cooldowns.robbery = now;

        if (success) {
            const base = Math.floor(Math.random() * (target.max - target.min + 1)) + target.min;
            const payout = Math.floor(base * weapon.mult);
            userData.wallet = (userData.wallet || 0) + payout;
            await setEconomyData(client, guildId, userId, userData);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    '🔫 211 — Successful',
                    `Hit the **${target.name}** with a **${weapon.name}**.\nGot away with **$${payout.toLocaleString()}**.`
                )]
            });
        } else {
            const fine = Math.floor(target.min * 0.6);
            userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
            userData.jailedUntil = now + JAIL_TIME;
            await setEconomyData(client, guildId, userId, userData);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(
                    '🚨 211 — Failed',
                    `LSPD swarmed the **${target.name}**. Fined **$${fine.toLocaleString()}** and jailed for 2 hours.`
                )]
            });
        }
    }, { command: 'robbery' })
};

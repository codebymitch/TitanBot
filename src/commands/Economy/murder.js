import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    MURDER_COOLDOWN,
    HOSPITAL_TIME,
    MIN_VICTIM_WALLET,
    calculateSuccessChance,
    calculatePayout,
    ensureMurderFields,
    getRankForXp,
    getNextRank,
} from '../../utils/murder.js';

export default {
    data: new SlashCommandBuilder()
        .setName('murder')
        .setDescription('Attempt to take out another player for cash and a rank-up.')
        .setDMPermission(false)
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('Who do you want to take out?')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const attackerId = interaction.user.id;
        const target = interaction.options.getUser('target');
        const guildId = interaction.guildId;
        const now = Date.now();

        // Basic validation
        if (attackerId === target.id) {
            throw createError(
                'Cannot murder self',
                ErrorTypes.VALIDATION,
                "You can't murder yourself. Try `/crime` if you want to ruin your own day.",
                { attackerId }
            );
        }
        if (target.bot) {
            throw createError(
                'Cannot murder bot',
                ErrorTypes.VALIDATION,
                "Bots are immortal in this town. Pick a real player.",
                { targetId: target.id }
            );
        }

        // Load economy data for both users
        const attackerData = await getEconomyData(client, guildId, attackerId);
        const victimData = await getEconomyData(client, guildId, target.id);

        if (!attackerData || !victimData) {
            throw createError(
                'Failed to load economy data',
                ErrorTypes.DATABASE,
                'Failed to load player data. Try again in a moment.',
                { attackerOk: !!attackerData, victimOk: !!victimData }
            );
        }

        ensureMurderFields(attackerData);
        ensureMurderFields(victimData);

        // Hospitalized / jailed checks for attacker
        if (attackerData.hospitalizedUntil && attackerData.hospitalizedUntil > now) {
            const minsLeft = Math.ceil((attackerData.hospitalizedUntil - now) / 60000);
            throw createError(
                'Attacker hospitalized',
                ErrorTypes.RATE_LIMIT,
                `You're still in the hospital from your last fight. **${minsLeft}m** left.`,
                { remaining: attackerData.hospitalizedUntil - now }
            );
        }
        if (attackerData.jailedUntil && attackerData.jailedUntil > now) {
            const minsLeft = Math.ceil((attackerData.jailedUntil - now) / 60000);
            throw createError(
                'Attacker jailed',
                ErrorTypes.RATE_LIMIT,
                `You're locked up. **${minsLeft}m** left in jail.`,
                { remaining: attackerData.jailedUntil - now }
            );
        }

        // Cooldown
        if (now < (attackerData.lastMurder || 0) + MURDER_COOLDOWN) {
            const remaining = (attackerData.lastMurder || 0) + MURDER_COOLDOWN - now;
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / 60000);
            throw createError(
                'Murder cooldown active',
                ErrorTypes.RATE_LIMIT,
                `The heat's still on you. Lay low for **${hours}h ${minutes}m** before your next hit.`,
                { remaining, cooldownType: 'murder' }
            );
        }

        // Victim must have some wallet — discourages farming inactive accounts
        if ((victimData.wallet || 0) < MIN_VICTIM_WALLET) {
            throw createError(
                'Victim too broke',
                ErrorTypes.VALIDATION,
                `${target.username} is broke — not worth the bullet. They need at least $${MIN_VICTIM_WALLET} in their wallet.`,
                { victimWallet: victimData.wallet }
            );
        }

        // Protection items — fail attempt cleanly but still consume cooldown
        const victimInventory = victimData.inventory || {};
        const hasVest = (victimInventory['bulletproof_vest'] || 0) > 0;
        const hasSafe = (victimInventory['personal_safe'] || 0) > 0;
        if (hasVest || hasSafe) {
            attackerData.lastMurder = now;
            attackerData.killStreak = 0; // failed attempt breaks streak
            await setEconomyData(client, guildId, attackerId, attackerData);

            const reason = hasVest ? 'a **Bulletproof Vest**' : 'a **Personal Safe** of bodyguards';
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'Hit Failed',
                        `${target.username} was wearing ${reason}. Your shot bounced off and you slipped away — empty handed. Your killstreak resets.`
                    ),
                ],
            });
        }

        // Roll the dice
        const successChance = calculateSuccessChance(
            attackerData.murderXp || 0,
            victimData.murderXp || 0,
            attackerData.killStreak || 0
        );
        const isSuccess = Math.random() < successChance;

        attackerData.lastMurder = now;

        if (isSuccess) {
            const payout = calculatePayout(attackerData.murderXp || 0, attackerData.killStreak || 0);
            const stolen = Math.min(victimData.wallet || 0, Math.floor((victimData.wallet || 0) * 0.10));
            const totalEarned = payout + stolen;

            const oldRank = getRankForXp(attackerData.murderXp || 0);
            attackerData.wallet = (attackerData.wallet || 0) + totalEarned;
            attackerData.kills = (attackerData.kills || 0) + 1;
            attackerData.killStreak = (attackerData.killStreak || 0) + 1;
            attackerData.bestKillStreak = Math.max(attackerData.bestKillStreak || 0, attackerData.killStreak);
            attackerData.murderXp = (attackerData.murderXp || 0) + oldRank.xpReward;

            victimData.wallet = Math.max(0, (victimData.wallet || 0) - stolen);
            victimData.deaths = (victimData.deaths || 0) + 1;
            victimData.killStreak = 0;

            const newRank = getRankForXp(attackerData.murderXp);
            const rankedUp = newRank.name !== oldRank.name;
            const next = getNextRank(attackerData.murderXp);

            await setEconomyData(client, guildId, attackerId, attackerData);
            await setEconomyData(client, guildId, target.id, victimData);

            const embed = successEmbed(
                rankedUp ? `RANK UP — ${newRank.name}` : 'Clean Kill',
                `You took out **${target.username}** and walked away with **$${totalEarned.toLocaleString()}** ` +
                `(${payout.toLocaleString()} contract + ${stolen.toLocaleString()} lifted from their wallet).`
            ).addFields(
                { name: 'Murder XP', value: `+${oldRank.xpReward} (total: ${attackerData.murderXp})`, inline: true },
                { name: 'Killstreak', value: `🔥 ${attackerData.killStreak}`, inline: true },
                { name: 'Rank', value: rankedUp ? `**${oldRank.name} → ${newRank.name}**` : newRank.name, inline: true },
                {
                    name: 'Next Rank',
                    value: next ? `${next.name} (need ${next.minXp - attackerData.murderXp} more XP)` : 'MAX RANK',
                    inline: false,
                },
            ).setFooter({ text: `Total kills: ${attackerData.kills} | K/D: ${(attackerData.kills / Math.max(1, attackerData.deaths)).toFixed(2)} | Next hit in 2h` });

            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        // Failure path — attacker gets hospitalized and pays medical bill
        const wallet = attackerData.wallet || 0;
        const medicalBill = Math.min(wallet, Math.floor(wallet * 0.15) + 100);
        attackerData.wallet = Math.max(0, wallet - medicalBill);
        attackerData.killStreak = 0;
        attackerData.hospitalizedUntil = now + HOSPITAL_TIME;

        await setEconomyData(client, guildId, attackerId, attackerData);

        const embed = errorEmbed(
            'Hit Failed — You Got Lit Up',
            `${target.username} pulled first and put you in the hospital. You paid **$${medicalBill.toLocaleString()}** in medical bills and lost your killstreak.`
        ).addFields(
            { name: 'Hospital Time', value: '30 minutes', inline: true },
            { name: 'Killstreak', value: '💀 0', inline: true },
            { name: 'Success Chance Was', value: `${Math.round(successChance * 100)}%`, inline: true },
        ).setFooter({ text: `Next hit available in 2h (after hospital).` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'murder' })
};

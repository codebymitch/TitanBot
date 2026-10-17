import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import type { EconomyData } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const BASE_WIN_CHANCE = 0.4;
const CLOVER_WIN_BONUS = 0.1;
const CHARM_WIN_BONUS = 0.08;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Setze dein Geld ein und gewinne mit etwas Glück mehr')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Betrag, den du setzen möchtest')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const betAmount = interaction.options.getInteger("amount")!;
            const now = Date.now();

            const userData: EconomyData & { lastGamble?: number } = await getEconomyData(client, guildId, userId);
            const lastGamble = userData.lastGamble || 0;
            let cloverCount = userData.inventory["lucky_clover"] || 0;
            let charmCount = userData.inventory["lucky_charm"] || 0;

            if (now < lastGamble + GAMBLE_COOLDOWN) {
                const remaining = lastGamble + GAMBLE_COOLDOWN - now;
                const minutes = Math.floor(remaining / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                throw createError(
                    "Gamble cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Mach mal Pause, bevor du wieder spielst. Warte **${minutes}m ${seconds}s**.`,
                    { remaining, cooldownType: 'gamble' }
                );
            }

            if (userData.wallet < betAmount) {
                throw createError(
                    "Insufficient cash for gamble",
                    ErrorTypes.VALIDATION,
                    `Du hast nur $${userData.wallet.toLocaleString()} in deiner Geldbörse, willst aber $${betAmount.toLocaleString()} setzen.`,
                    { required: betAmount, current: userData.wallet }
                );
            }

            let winChance = BASE_WIN_CHANCE;
            let cloverMessage = "";
            let usedClover = false;
            let usedCharm = false;

            if (cloverCount > 0) {
                winChance += CLOVER_WIN_BONUS;
                userData.inventory["lucky_clover"] -= 1;
                cloverMessage = `\n🍀 **Glücksklee verbraucht:** Deine Gewinnchance wurde erhöht!`;
                usedClover = true;
            }
            
            else if (charmCount > 0) {
                winChance += CHARM_WIN_BONUS;
                userData.inventory["lucky_charm"] -= 1;
                cloverMessage = `\n🍀 **Glücksbringer benutzt (noch ${charmCount - 1} Nutzungen):** Deine Gewinnchance wurde erhöht!`;
                usedCharm = true;
            }

            const win = Math.random() < winChance;
            let cashChange = 0;
            let resultEmbed;

            if (win) {
                const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
                // Net change: the bet is replaced by the payout (bet was at stake, not pre-deducted)
                cashChange = amountWon - betAmount;

                resultEmbed = successEmbed(
                    "🎉 Gewonnen!",
                    `Du hast aus deinem Einsatz von **$${betAmount.toLocaleString()}** ganze **$${amountWon.toLocaleString()}** gemacht!${cloverMessage}`,
                );
            } else {
cashChange = -betAmount;

                resultEmbed = warningEmbed(
                    "💔 Verloren...",
                    `Das Glück war nicht auf deiner Seite. Dein Einsatz von **$${betAmount.toLocaleString()}** ist weg.`,
                );
            }

            userData.wallet = (userData.wallet || 0) + cashChange;
userData.lastGamble = now;

            await setEconomyData(client, guildId, userId, userData);

            const newCash = userData.wallet;

            resultEmbed.addFields({
                name: "Geldbörse (neu)",
                value: `$${newCash.toLocaleString()}`,
                inline: true,
            });

            if (usedClover) {
                resultEmbed.setFooter({
                    text: `Du hast noch ${userData.inventory["lucky_clover"]} Glücksklee. Gewinnchance war ${Math.round(winChance * 100)} %.`,
                });
            } else if (usedCharm) {
                resultEmbed.setFooter({
                    text: `Du hast noch ${userData.inventory["lucky_charm"]} Glücksbringer-Nutzungen. Gewinnchance war ${Math.round(winChance * 100)} %.`,
                });
            } else {
                resultEmbed.setFooter({
                    text: `Nächstes Spiel in 5 Minuten möglich. Basis-Gewinnchance: ${Math.round(BASE_WIN_CHANCE * 100)} %.`,
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'gamble' })
} satisfies Command;

import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import type { EconomyData } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const MINE_COOLDOWN = 60 * 60 * 1000;
const BASE_MIN_REWARD = 400;
const BASE_MAX_REWARD = 1200;
const PICKAXE_MULTIPLIER = 1.2;
const DIAMOND_PICKAXE_MULTIPLIER = 2.0;

const MINE_LOCATIONS = [
    "eine verlassene Goldmine",
    "eine dunkle, feuchte Höhle",
    "einen Steinbruch im Hinterhof",
    "einen vulkanischen Obsidianschlot",
    "einen Tiefsee-Mineraliengraben",
];

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Geh in die Mine und verdiene Geld'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const now = Date.now();

            const userData: EconomyData & { lastMine?: number } = await getEconomyData(client, guildId, userId);
            const lastMine = userData.lastMine || 0;
            const hasDiamondPickaxe = userData.inventory["diamond_pickaxe"] || 0;
            const hasPickaxe = userData.inventory["pickaxe"] || 0;

            if (now < lastMine + MINE_COOLDOWN) {
                const remaining = lastMine + MINE_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Mining cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Deine Spitzhacke muss sich erholen. Warte **${hours}h ${minutes}m**, bevor du wieder schürfst.`,
                    { remaining, cooldownType: 'mine' }
                );
            }

            const baseEarned =
                Math.floor(
                    Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1),
                ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasDiamondPickaxe > 0) {
                finalEarned = Math.floor(baseEarned * DIAMOND_PICKAXE_MULTIPLIER);
                multiplierMessage = `\n💎 **Diamant-Spitzhacken-Bonus: +100 %**`;
            } else if (hasPickaxe > 0) {
                finalEarned = Math.floor(baseEarned * PICKAXE_MULTIPLIER);
                multiplierMessage = `\n⛏️ **Spitzhacken-Bonus: +20 %**`;
            }

            const location =
                MINE_LOCATIONS[
                    Math.floor(Math.random() * MINE_LOCATIONS.length)
                ];

            userData.wallet += finalEarned;
userData.lastMine = now;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 Bergbau-Expedition erfolgreich!",
                `Du hast **${location}** erkundet und Mineralien im Wert von **$${finalEarned.toLocaleString()}** gefunden!${multiplierMessage}`,
            )
                .addFields({
                    name: "Geldbörse (neu)",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({ text: `Nächstes Schürfen in 1 Stunde möglich.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'mine' })
} satisfies Command;

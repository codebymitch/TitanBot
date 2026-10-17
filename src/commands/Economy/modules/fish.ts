import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import type { EconomyData } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'Barsch', emoji: '🐟', rarity: 'common' },
    { name: 'Lachs', emoji: '🐟', rarity: 'common' },
    { name: 'Forelle', emoji: '🐟', rarity: 'common' },
    { name: 'Thunfisch', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Schwertfisch', emoji: '🐠', rarity: 'uncommon' },
    { name: 'Oktopus', emoji: '🐙', rarity: 'rare' },
    { name: 'Hummer', emoji: '🦞', rarity: 'rare' },
    { name: 'Hai', emoji: '🦈', rarity: 'epic' },
    { name: 'Wal', emoji: '🐋', rarity: 'legendary' },
];

const RARITY_LABELS: Record<string, string> = {
    common: 'Gewöhnlich',
    uncommon: 'Ungewöhnlich',
    rare: 'Selten',
    epic: 'Episch',
    legendary: 'Legendär',
};

const CATCH_MESSAGES = [
    "Du wirfst deine Angel ins kristallklare Wasser...",
    "Du wartest geduldig, während dein Schwimmer treibt...",
    "Nach ein paar Minuten spürst du einen Ruck...",
    "Das Wasser kräuselt sich, als etwas anbeißt...",
    "Du holst deinen Fang mit Profi-Präzision ein...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Geh angeln, fang Fische und verdiene Geld'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const now = Date.now();

            const userData: EconomyData & { lastFish?: number } = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const hasFishingRod = userData.inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Du bist gerade zu müde zum Angeln. Ruh dich **${hours}h ${minutes}m** aus, bevor du wieder angelst.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic')!;
            } else {
                
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary')!;
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **Angel-Bonus: +50 %**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors: Record<string, string> = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const embed = createEmbed({
                title: 'Erfolgreich geangelt!',
                description: `${catchMessage}\n\nDein Fang: **${fishCaught.emoji} ${fishCaught.name}**! Du hast ihn für **$${finalEarned.toLocaleString()}** verkauft!${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "Geldbörse (neu)",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Seltenheit",
                        value: RARITY_LABELS[fishCaught.rarity] ?? fishCaught.rarity,
                        inline: true,
                    }
                )
                .setFooter({ text: `Nächster Angelausflug in 45 Minuten möglich.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
} satisfies Command;

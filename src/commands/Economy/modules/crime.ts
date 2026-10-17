import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import type { EconomyData } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const JAIL_TIME = 2 * 60 * 60 * 1000;
const FINE_RATE = 0.2;

const CRIME_TYPES = [
    { name: "Pickpocketing", label: "Taschendiebstahl", min: 100, max: 500, risk: 0.3 },
    { name: "Burglary", label: "Einbruch", min: 300, max: 1000, risk: 0.4 },
    { name: "Bank Heist", label: "Banküberfall", min: 1000, max: 5000, risk: 0.6 },
    { name: "Art Theft", label: "Kunstraub", min: 2000, max: 10000, risk: 0.7 },
    { name: "Cybercrime", label: "Cyberkriminalität", min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Begehe ein Verbrechen, um Geld zu verdienen (riskant)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Art des Verbrechens')
                .setRequired(true)
                .addChoices(
                    { name: 'Taschendiebstahl', value: 'pickpocketing' },
                    { name: 'Einbruch', value: 'burglary' },
                    { name: 'Banküberfall', value: 'bank-heist' },
                    { name: 'Kunstraub', value: 'art-theft' },
                    { name: 'Cyberkriminalität', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const now = Date.now();

            const userData: EconomyData & { jailedUntil?: number } = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil! - now) / (1000 * 60));
                throw createError(
                    "User is in jail",
                    ErrorTypes.RATE_LIMIT,
                    `Du sitzt noch ${timeLeft} Minuten im Gefängnis!`,
                    { jailTimeRemaining: userData.jailedUntil! - now }
                );
            }

            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                throw createError(
                    "Crime cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Du musst noch ${timeLeft} Minuten warten, bevor du das nächste Verbrechen begehen kannst.`,
                    { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
                );
            }

            const crimeType = interaction.options.getString("type")!.toLowerCase();
            const crime = CRIME_TYPES.find(
                c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
            );

            if (!crime) {
                throw createError(
                    "Invalid crime type",
                    ErrorTypes.VALIDATION,
                    "Bitte wähle eine gültige Verbrechensart.",
                    { crimeType }
                );
            }

            const isSuccess = Math.random() > crime.risk;
            const amountEarned = isSuccess
                ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
                : 0;

            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = successEmbed(
                    "🕵️ Verbrechen erfolgreich!",
                    `Dein Coup „${crime.label}“ war erfolgreich und hat dir **${amountEarned}** Münzen eingebracht!`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                // Fine is based on the potential haul of the attempted crime
                const potentialHaul = Math.floor((crime.min + crime.max) / 2);
                const fine = Math.min(Math.floor(potentialHaul * FINE_RATE), userData.wallet || 0);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = warningEmbed(
                    "🚔 Verbrechen gescheitert!",
                    `Du wurdest bei „${crime.label}“ erwischt und ins Gefängnis gesteckt! ` +
                    `Du musst ${fine.toLocaleString()} Münzen Strafe zahlen und sitzt 2 Stunden im Gefängnis.`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
    }, { command: 'crime' })
} satisfies Command;

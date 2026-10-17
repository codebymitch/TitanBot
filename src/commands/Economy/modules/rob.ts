import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed, buildUserErrorEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { BotConfig } from '../../../config/bot.js';

const ROB_COOLDOWN = BotConfig.economy?.cooldowns?.rob ?? 4 * 60 * 60 * 1000;
const BASE_ROB_SUCCESS_CHANCE = BotConfig.economy?.robSuccessRate ?? 0.4;
const ROB_PERCENTAGE = 0.15;
const FINE_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Versuche, einen anderen Nutzer auszurauben (sehr riskant)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Nutzer, den du ausrauben willst')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const robberId = interaction.user.id;
            const victimUser = interaction.options.getUser("user")!;
            const guildId = interaction.guildId!;
            const now = Date.now();

            if (robberId === victimUser.id) {
                throw createError(
                    "Cannot rob self",
                    ErrorTypes.VALIDATION,
                    "Du kannst dich nicht selbst ausrauben.",
                    { robberId, victimId: victimUser.id }
                );
            }
            
            if (victimUser.bot) {
                throw createError(
                    "Cannot rob bot",
                    ErrorTypes.VALIDATION,
                    "Du kannst keinen Bot ausrauben.",
                    { victimId: victimUser.id, isBot: true }
                );
            }

            const robberData = await getEconomyData(client, guildId, robberId);
            const victimData = await getEconomyData(client, guildId, victimUser.id);
            
            if (!robberData || !victimData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Die Wirtschaftsdaten konnten nicht geladen werden. Bitte versuch es später erneut.",
                    { robberId: !!robberData, victimId: !!victimData, guildId }
                );
            }
            
            const lastRob = robberData.lastRob || 0;

            if (now < lastRob + ROB_COOLDOWN) {
                const remaining = lastRob + ROB_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

                throw createError(
                    "Robbery cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Du musst untertauchen. Warte **${hours}h ${minutes}m**, bevor du den nächsten Raub versuchst.`,
                    { remaining, hours, minutes, cooldownType: 'rob' }
                );
            }

            if (victimData.wallet < 500) {
                throw createError(
                    "Victim too poor",
                    ErrorTypes.VALIDATION,
                    `${victimUser.username} ist zu arm. Es lohnt sich erst ab mindestens $500 in der Geldbörse.`,
                    { victimWallet: victimData.wallet, required: 500 }
                );
            }

            const hasSafe = victimData.inventory["personal_safe"] || 0;

            if (hasSafe > 0) {
                robberData.lastRob = now;
                await setEconomyData(client, guildId, robberId, robberData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        warningEmbed(
                            'Raub verhindert',
                            `${victimUser.username} war vorbereitet! Dein Versuch ist an einem **persönlichen Safe** gescheitert. Du bist unerkannt entkommen, hast aber nichts erbeutet.`
                        )
                    ],
                });
            }

            const isSuccessful = Math.random() < BASE_ROB_SUCCESS_CHANCE;
            let resultEmbed;

            if (isSuccessful) {
                const amountStolen = Math.floor(victimData.wallet * ROB_PERCENTAGE);

                robberData.wallet = (robberData.wallet || 0) + amountStolen;
                victimData.wallet = (victimData.wallet || 0) - amountStolen;

                resultEmbed = successEmbed(
                    'Raub erfolgreich',
                    `Du hast ${victimUser.username} erfolgreich **$${amountStolen.toLocaleString()}** abgenommen!`
                );
            } else {
                const fineAmount = Math.floor((robberData.wallet || 0) * FINE_PERCENTAGE);

                if ((robberData.wallet || 0) < fineAmount) {
                    robberData.wallet = 0;
                } else {
                    robberData.wallet = (robberData.wallet || 0) - fineAmount;
                }

                resultEmbed = buildUserErrorEmbed(
                    'unknown',
                    `Der Raub ist gescheitert und du wurdest erwischt! Du musst **$${fineAmount.toLocaleString()}** aus deiner eigenen Geldbörse Strafe zahlen.`,
                    { titleOverride: 'Raub gescheitert' }
                );
            }

            robberData.lastRob = now;

            await setEconomyData(client, guildId, robberId, robberData);
            await setEconomyData(client, guildId, victimUser.id, victimData);

            resultEmbed
                .addFields(
                    {
                        name: `Deine Geldbörse (${interaction.user.username})`,
                        value: `$${robberData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: `Geldbörse des Opfers (${victimUser.username})`,
                        value: `$${victimData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({ text: `Nächster Raub in ${Math.ceil(ROB_COOLDOWN / (60 * 60 * 1000))} Stunden möglich.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'rob' })
} satisfies Command;

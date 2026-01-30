import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

// --- Configuration ---
const ROB_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours
const BASE_ROB_SUCCESS_CHANCE = 0.25; // 25% chance of success
const ROB_PERCENTAGE = 0.15; // Robber takes 15% of the victim's cash
const FINE_PERCENTAGE = 0.1; // Robber loses 10% of their cash if caught/failed


export default {
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("rob")
        .setDescription("Attempt to steal cash from another user.")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("The user you want to rob.")
                .setRequired(true),
        )
        .setDMPermission(false),
    
    // Prefix command data
    name: "rob",
    aliases: ["steal", "mug"],
    description: "Attempt to steal cash from another user.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}rob <user>`,
    cooldown: 240, // 4 hours

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const robberId = interaction.user.id;
        const victimUser = interaction.options.getUser("user");
        const guildId = interaction.guildId;
        const now = Date.now();

        // --- 1. Initial Checks ---
        if (robberId === victimUser.id) {
            return interaction.editReply({
                embeds: [
                    errorEmbed("Robbery Failed", "You cannot rob yourself."),
                ],
            });
        }
        if (victimUser.bot) {
            return interaction.editReply({
                embeds: [errorEmbed("Robbery Failed", "You cannot rob a bot.")],
            });
        }

        try {
            const robberData = await getEconomyData(client, guildId, robberId);
            const victimData = await getEconomyData(
                client,
                guildId,
                victimUser.id,
            );
            const lastRob = robberData.lastRob || 0;

            // --- 2. Cooldown Check ---
            if (now < lastRob + ROB_COOLDOWN) {
                const remaining = lastRob + ROB_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Robbery Cooldown",
                            `You need to lay low. Wait **${hours}h ${minutes}m** before attempting another robbery.`,
                        ),
                    ],
                });
            }

            // --- 3. Victim Check ---
            if (victimData.wallet < 500) {
                // Set a minimum cash requirement for a worthwhile robbery
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Robbery Failed",
                            `${victimUser.username} is too poor. They need at least $500 cash to be worth robbing.`,
                        ),
                    ],
                });
            }

            // --- 4. Personal Safe Check ---
            const hasSafe = victimData.inventory["personal_safe"] || 0;

            if (hasSafe > 0) {
                // Victim owns a Personal Safe, robbery fails but no fine is applied to the robber
                robberData.cooldowns.rob = now;
                await setEconomyData(client, guildId, robberId, robberData);

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "🚨 Safe Activated!",
                            `${victimUser.username} was prepared! Your attempt failed because they own a **Personal Safe**. You got away clean but didn't gain anything.`,
                        ),
                    ],
                });
            }

            // --- 5. Gambling Logic (without Safe) ---
            const isSuccessful = Math.random() < BASE_ROB_SUCCESS_CHANCE;
            let resultEmbed;

            if (isSuccessful) {
                // Success: Robber gains cash, Victim loses cash
                const amountStolen = Math.floor(
                    victimData.wallet * ROB_PERCENTAGE,
                );

                robberData.wallet += amountStolen;
                victimData.wallet -= amountStolen;

                resultEmbed = successEmbed(
                    "💰 Robbery Successful!",
                    `You successfully stole **$${amountStolen.toLocaleString()}** from ${victimUser.username}!`,
                );
            } else {
                // Failure: Robber loses cash (fined), Victim loses nothing
                const fineAmount = Math.floor(
                    robberData.wallet * FINE_PERCENTAGE,
                );

                if (robberData.wallet < fineAmount) {
                    robberData.wallet = 0;
                } else {
                    robberData.wallet -= fineAmount;
                }

                resultEmbed = errorEmbed(
                    "🚔 Caught!",
                    `You failed the robbery and were caught! You were fined **$${fineAmount.toLocaleString()}** of your own cash.`,
                );
            }

            // --- 6. Update Data and Respond ---
            robberData.lastRob = now;

            await setEconomyData(client, guildId, robberId, robberData);
            await setEconomyData(client, guildId, victimUser.id, victimData);

            resultEmbed
                .addFields(
                    {
                        name: `Your New Cash (${interaction.user.username})`,
                        value: `$${robberData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: `Victim's New Cash (${victimUser.username})`,
                        value: `$${victimData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({ text: `Next robbery available in 4 hours.` });

            await interaction.editReply({ embeds: [resultEmbed] });
        } catch (error) {
            console.error("Rob command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process the robbery attempt.",
                    ),
                ],
            });
        }
    },
};


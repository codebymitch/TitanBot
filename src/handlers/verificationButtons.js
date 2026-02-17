import { ButtonInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { verifyUser } from '../services/verificationService.js';
import { handleInteractionError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';

/**
 * Handle verification button clicks
 * Uses centralized verification service for consistency
 * 
 * @param {ButtonInteraction} interaction - The button interaction
 * @param {Client} client - Discord client
 */
export async function handleVerificationButton(interaction, client) {
    try {
        // Verify button can only be used in guilds
        if (!interaction.guild) {
            return await interaction.reply({
                embeds: [errorEmbed("Guild Only", "This button can only be used in a server.")],
                flags: MessageFlags.Ephemeral
            });
        }

        const guild = interaction.guild;
        const userId = interaction.user.id;

        logger.debug('User clicked verify button', {
            guildId: guild.id,
            userId,
            userTag: interaction.user.tag
        });

        // Use service layer for verification
        const result = await verifyUser(client, guild.id, userId, {
            source: 'button_click',
            moderatorId: null
        });

        if (!result.success) {
            if (result.alreadyVerified) {
                return await interaction.reply({
                    embeds: [errorEmbed(
                        "Already Verified",
                        "You are already verified and have access to all server channels."
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }

            return await interaction.reply({
                embeds: [errorEmbed(
                    "Verification Failed",
                    "An error occurred during verification. Please try again or contact an administrator."
                )],
                flags: MessageFlags.Ephemeral
            });
        }

        // Success response
        logger.info('User verified via button', {
            guildId: guild.id,
            userId,
            roleName: result.roleName
        });

        await interaction.reply({
            embeds: [successEmbed(
                "✅ Verification Successful!",
                `You have been verified and given the **${result.roleName}** role!\n\nYou now have access to all server channels and features. Welcome! 🎉`
            )],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        logger.error('Error in verification button handler', {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

        // Use centralized error handler
        await handleInteractionError(
            interaction,
            error,
            { command: 'verify_button', action: 'verification' }
        );
    }
}

export default {
    customId: "verify_user",
    execute: handleVerificationButton
};

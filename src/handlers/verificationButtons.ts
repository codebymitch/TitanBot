import { MessageFlags } from 'discord.js';
import type { ButtonInteraction } from 'discord.js';
import type { NexoClient } from '../types/index.js';
import { successEmbed } from '../utils/embeds.js';
import { verifyUser } from '../services/verificationService.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

export async function handleVerificationButton(interaction: ButtonInteraction, client: NexoClient): Promise<unknown> {
    try {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.guild) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diesen Button kannst du nur auf einem Server nutzen.' });
        }

        const guild = interaction.guild;
        const userId = interaction.user.id;

        logger.debug('User clicked verify button', {
            guildId: guild.id,
            userId,
            userTag: interaction.user.tag
        });

        const result = await verifyUser(client, guild.id, userId, {
            source: 'button_click',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Du bist bereits verifiziert und hast Zugriff auf alle Kanäle des Servers.' });
        }

        logger.info('User verified via button', {
            guildId: guild.id,
            userId,
            roleName: result.roleName
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "✅ Verifizierung erfolgreich!",
                `Du wurdest verifiziert und hast die Rolle **${result.roleName}** erhalten!\n\nDu hast jetzt Zugriff auf alle Kanäle und Funktionen des Servers. Willkommen! 🎉`
            )],
        });

    } catch (error) {
        logger.error('Error in verification button handler', {
            error: error instanceof Error ? error.message : String(error),
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

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
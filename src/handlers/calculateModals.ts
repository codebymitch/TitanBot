import type { ModalSubmitInteraction, TextBasedChannel } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { evaluateMathExpression } from '../utils/safeMathParser.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import type { ModalHandler, NexoClient } from '../types/index.js';
function evaluate(expression: string) {
    return evaluateMathExpression(expression);
}

async function calculateModalHandler(interaction: ModalSubmitInteraction, client: NexoClient, args: string[]): Promise<unknown> {
    try {
        const operation = args[0];
        // JS called interaction.fields.first(), which does not exist on ModalSubmitFields (always threw); the field Collection is .fields.
        const operandInput = interaction.fields.fields.first();
        const contextKey = operandInput?.customId?.split(':')[1];
        
        if (!contextKey) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Der Rechenkontext konnte nicht geladen werden.' });
        }

        const { calculationContexts } = await import('../commands/Tools/modules/calculate.js');
        const context = calculationContexts.get(contextKey);
        
        if (!context) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diese Berechnung ist abgelaufen. Bitte starte eine neue.' });
        }

        await interaction.deferReply({ ephemeral: false });

        const operand = interaction.fields.getTextInputValue(operandInput.customId);
        
        if (!operand || isNaN(Number(operand))) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte gib eine gültige Zahl ein.' });
        }

        const { expression, formattedResult, operator } = context;
        const newExpression = `(${expression}) ${operator} (${operand})`;

        let newResult;
        try {
            newResult = evaluate(newExpression);
            
            let formattedNewResult;
            if (typeof newResult === "number") {
                formattedNewResult = newResult.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(newResult) > 0 &&
                    (Math.abs(newResult) >= 1e10 || Math.abs(newResult) < 1e-3)
                ) {
                    formattedNewResult = newResult.toExponential(6);
                }
            } else {
                formattedNewResult = String(newResult);
            }

            const updatedEmbed = successEmbed(
                "🧮 Rechenergebnis",
                `**Ausdruck:** \`${newExpression.replace(/`/g, "\`")}\`\n` +
                    `**Ergebnis:** \`${formattedNewResult}\`\n\n` +
                    `*Nutze die Buttons in der Kanal-Nachricht für weitere Rechenschritte.*`,
            );

            try {
                if (context.messageId && context.channelId) {
                    const channel = await client.channels.fetch(context.channelId) as TextBasedChannel;
                    const message = await channel.messages.fetch(context.messageId);
                    await message.edit({
                        embeds: [updatedEmbed],
                    });
                }
            } catch (editError) {
                logger.warn('Could not edit original message:', editError instanceof Error ? editError.message : String(editError));
            }

            calculationContexts.delete(contextKey);

            await interaction.editReply({
                embeds: [successEmbed('✅ Berechnet', `\`${newExpression}\` = \`${formattedNewResult}\``)],
            });

        } catch (calcError) {
            logger.error('Calculate evaluation error:', calcError);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Der Ausdruck konnte nicht berechnet werden.' });
        }
    } catch (error) {
        logger.error('Calculate modal handler error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bei deiner Berechnung ist ein Fehler aufgetreten.' });
            } else {
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bei deiner Berechnung ist ein Fehler aufgetreten.' });
            }
        } catch (err) {
            logger.error('Failed to send error message:', err);
        }
    }
}

export default {
    execute: calculateModalHandler
} satisfies Pick<ModalHandler, 'execute'>;
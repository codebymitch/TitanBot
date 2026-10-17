import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, type MessageComponentInteraction } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../../utils/safeMathParser.js';
import type { Command } from '../../../types/index.js';

/** Pending operand-modal context, read by handlers/calculateModals. */
export interface CalculationContext {
    expression: string;
    formattedResult: string;
    operator: string;
    messageId: string | undefined;
    channelId: string;
    userId: string;
}

interface CalculationHistoryEntry {
    expression: string;
    result: string;
    timestamp: number;
}

const calculationContexts = new Map<string, CalculationContext>();

function evaluate(expression: string) {
    return evaluateMathExpression(expression);
}

const calculationHistory = new Map<string, CalculationHistoryEntry[]>();
const MAX_HISTORY = 5;

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("Berechnet einen mathematischen Ausdruck")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "Der Ausdruck, der berechnet werden soll (z. B. 2+2*3, sin(45 deg), 16^0.5)",
                )
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Calculate interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'calculate'
            });
            return;
        }

        const expression = interaction.options.getString("expression")!;

        if (
            !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: '**Enthält nicht unterstützte Zeichen.**\n\n' +
                    '✅ Unterstützt: Zahlen, Dezimalzahlen, + - * / ^ %, sin cos tan sqrt abs log exp, pi e, ()\n' +
                    '❌ Nicht unterstützt: eckige und geschweifte Klammern sowie andere Symbole'
            });
        }

        const dangerousPatterns = [
            /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
            /`/g,
            /\$\{.*\}/,
            /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
            /\b(?:while|for)\s*\([^)]*\)\s*\{/,
            /\b(?:function\*|yield|await|async)\b/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: '**Enthält gesperrte Code-Muster.**\n\n' +
                        '🚫 **Gesperrt:** import, require, eval, Function, setTimeout, setInterval, process, fs, document, window, fetch, Schleifen, async/await\n\n' +
                        'Code-ähnliche Syntax ist in Berechnungen nicht erlaubt.'
                });
            }
        }

        let result;
        try {
            result = evaluate(expression);

            let formattedResult;
            if (typeof result === "number") {
                formattedResult = result.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(result) > 0 &&
                    (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)
                ) {
                    formattedResult = result.toExponential(6);
                }
            } else if (typeof result === "boolean") {
                formattedResult = result ? "true" : "false";
            } else if (result === null || result === undefined) {
                formattedResult = "Kein Ergebnis";
            } else if (
                Array.isArray(result) ||
                typeof result === "object"
            ) {
                formattedResult =
                    "```json\n" + JSON.stringify(result, null, 2) + "\n```";
            } else {
                formattedResult = String(result);
            }

            const userId = interaction.user.id;
            if (!calculationHistory.has(userId)) {
                calculationHistory.set(userId, []);
            }

            const history = calculationHistory.get(userId)!;
            history.unshift({
                expression,
                result: formattedResult,
                timestamp: Date.now(),
            });

            if (history.length > MAX_HISTORY) {
                history.pop();
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_add`)
                    .setLabel("+")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_subtract`)
                    .setLabel("-")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_multiply`)
                    .setLabel("×")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_divide`)
                    .setLabel("÷")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_history`)
                    .setLabel("Verlauf")
                    .setStyle(ButtonStyle.Secondary),
            );

            const embed = successEmbed(
                "🧮 Rechenergebnis",
                `**Ausdruck:** \`${expression.replace(/`/g, "\`")}\`\n` +
                    `**Ergebnis:** \`${formattedResult}\`\n\n` +
                    `*Nutze die Buttons unten, um mit dem Ergebnis weiterzurechnen.*`,
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            });

            const filter = (i: MessageComponentInteraction) =>
                i.customId.startsWith(`calc_${interaction.id}`) &&
                i.user.id === interaction.user.id;
            const BUTTON_TIMEOUT = 300000;
            const collector =
                interaction.channel!.createMessageComponentCollector({
                    filter,
                    time: BUTTON_TIMEOUT,
                });

            collector.on("collect", async (i) => {
                try {
                    const operation = i.customId.split("_")[2];

                    if (operation === "history") {
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate().catch(console.error);
                        }

                        const userHistory =
                            calculationHistory.get(userId) || [];

                        if (userHistory.length === 0) {
                            await i.followUp({
                                content: "Kein Rechenverlauf gefunden.",
                                flags: ["Ephemeral"],
                            });
                            return;
                        }

                        const historyText = userHistory
                            .map(
                                (item, index) =>
                                    `${index + 1}. **${item.expression}** = \`${item.result}\`\n` +
                                    `<t:${Math.floor(item.timestamp / 1000)}:R>`,
                            )
                            .join("\n\n");

                        await i.followUp({
                            content: `📜 **Dein Rechenverlauf**\n\n${historyText}`,
                            flags: ["Ephemeral"],
                        });
                        return;
                    }

                    let operator = "";

                    switch (operation) {
                        case "add":
                            operator = "+";
                            break;
                        case "subtract":
                            operator = "-";
                            break;
                        case "multiply":
                            operator = "*";
                            break;
                        case "divide":
                            operator = "/";
                            break;
                    }

                    try {
                        const contextKey = `${i.user.id}_${operation}`;
                        calculationContexts.set(contextKey, {
                            expression,
                            formattedResult,
                            operator,
                            // ChatInputCommandInteraction has no .message, so this was always undefined in JS
                            messageId: undefined,
                            channelId: interaction.channelId,
                            userId: i.user.id
                        });

                        await i.showModal({
                            customId: `calc_modal:${operation}`,
                            title: `Zahl eingeben (${operator})`,
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 4,
                                            customId: `operand:${contextKey}`,
                                            label: `Rechnung: ${formattedResult} ${operator} …`,
                                            placeholder: "Zahl eingeben …",
                                            style: 1,
                                            required: true,
                                            maxLength: 50,
                                        },
                                    ],
                                },
                            ],
                        });
                    } catch (modalError) {
                        logger.error("Failed to show modal:", modalError);
                        if (!i.replied && !i.deferred) {
                            await i.reply({
                                content: "Der Rechner konnte nicht geöffnet werden. Versuch es noch mal.",
                                flags: ["Ephemeral"],
                            }).catch(console.error);
                        }
                        return;
                    }

                } catch (error) {
                    logger.error("Button interaction error:", error);
                    if (!i.deferred && !i.replied) {
                        await i.followUp({
                            content: "Beim Verarbeiten deiner Anfrage ist ein Fehler aufgetreten.",
                            flags: ["Ephemeral"],
                        }).catch(console.error);
                    }
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason === "timeout") {
                    const disabledRow =
                        new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `calc_${interaction.id}_expired`,
                                )
                                .setLabel("Rechner abgelaufen")
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                        );

                    interaction
                        .editReply({
                            components: [disabledRow],
                            content:
                                "⏱️ Dieser Rechner ist abgelaufen. Nutze den Command erneut, um weiterzurechnen.",
                        })
                        .catch(console.error);
                } else {
                    const disabledRow = ActionRowBuilder.from<ButtonBuilder>(
                        row,
                    ).setComponents(
                        row.components.map((component) =>
                            ButtonBuilder.from(component).setDisabled(true),
                        ),
                    );

                    interaction
                        .editReply({ components: [disabledRow] })
                        .catch(console.error);
                }
            });
        } catch (error) {
            logger.error('Calculation error:', error);

            let errorMessage = 'Der Ausdruck konnte nicht berechnet werden. ';
            const errorText = error instanceof Error ? error.message : String(error);

            if (errorText.includes('Unexpected type')) {
                errorMessage +=
                    'Er enthält eine nicht unterstützte Operation oder Funktion.';
            } else if (errorText.includes('Undefined symbol')) {
                errorMessage +=
                    'Er enthält eine unbekannte Variable oder Funktion.';
            } else if (errorText.includes('Brackets not balanced')) {
                errorMessage += 'Die Klammern sind nicht ausgeglichen.';
            } else if (
                errorText.includes('Unexpected operator') ||
                errorText.includes('Unexpected character')
            ) {
                errorMessage +=
                    'Er enthält einen ungültigen Operator oder ein ungültiges Zeichen.';
            } else {
                errorMessage += 'Bitte prüf die Syntax und versuch es noch mal.';
            }

            await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: errorMessage,
            });
        }
    },
} satisfies Command;
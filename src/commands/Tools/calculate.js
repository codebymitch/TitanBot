import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Store calculation context for modal handlers
const calculationContexts = new Map();

function evaluate(expression) {
    let expr = expression.replace(/\s/g, '').toLowerCase();
    
    const math = {
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        sqrt: Math.sqrt,
        abs: Math.abs,
        log: Math.log,
        log10: Math.log10,
        exp: Math.exp,
        pi: Math.PI,
        e: Math.E
    };
    
    expr = expr.replace(/sin|cos|tan|sqrt|abs|log|log10|exp|pi|e/g, (match) => `math.${match}`);
    
    expr = expr.replace(/(\d+)\s*deg/g, (match, num) => `(${num} * Math.PI / 180)`);
    
    expr = expr.replace(/\^/g, '**');
    
    try {
        const func = new Function('math', `return ${expr}`);
        return func(math);
    } catch (error) {
        throw new Error(`Invalid expression: ${error.message}`);
    }
}

const calculationHistory = new Map();
const MAX_HISTORY = 5;

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("Evaluate a mathematical expression")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "The mathematical expression to evaluate (e.g., 2+2*3, sin(45 deg), 16^0.5)",
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

try {

            const expression = interaction.options.getString("expression");

            if (
                !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
            ) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "❌ Invalid Expression",
                            "**Contains unsupported characters.**\n\n" +
                                "✅ Supported: Numbers, decimals, + - * / ^ %, sin cos tan sqrt abs log exp, pi e, ()\n" +
                                "❌ Not supported: Brackets, curly braces, and other symbols",
                        ),
                    ],
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
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "🔒 Security Alert",
                                "**Contains blocked code patterns.**\n\n" +
                                "🚫 **Blocked:** import, require, eval, Function, setTimeout, setInterval, process, fs, document, window, fetch, loops, async/await\n\n" +
                                "Code-like syntax is not allowed in calculations.",
                            ),
                        ],
                        flags: ["Ephemeral"],
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
                    formattedResult = "No result";
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

                const history = calculationHistory.get(userId);
                history.unshift({
                    expression,
                    result: formattedResult,
                    timestamp: Date.now(),
                });

                if (history.length > MAX_HISTORY) {
                    history.pop();
                }

                const row = new ActionRowBuilder().addComponents(
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
                        .setLabel("History")
                        .setStyle(ButtonStyle.Secondary),
                );

                const embed = successEmbed(
                    "🧮 Calculation Result",
                    `**Expression:** \`${expression.replace(/`/g, "\`")}\`\n` +
                        `**Result:** \`${formattedResult}\`\n\n` +
                        `*Use the buttons below to perform operations with the result.*`,
                );

                await interaction.editReply({
                    embeds: [embed],
                    components: [row],
                });

                const filter = (i) =>
                    i.customId.startsWith(`calc_${interaction.id}`) &&
                    i.user.id === interaction.user.id;
const BUTTON_TIMEOUT = 300000;
                const collector =
                    interaction.channel.createMessageComponentCollector({
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
                                    content: "No calculation history found.",
                                    flags: ["Ephemeral"],
                                });
                                return;
                            }

                            const historyText = userHistory
                                .map(
                                    (item, index) =>
                                        `${index + 1}. **${item.expression}** = \`${item.result}\`\n` +
                                        `   <t:${Math.floor(item.timestamp / 1000)}:R>`,
                                )
                                .join("\n\n");

                            await i.followUp({
                                content: `📜 **Your Calculation History**\n\n${historyText}`,
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
                                messageId: interaction.message?.id,
                                channelId: interaction.channelId,
                                userId: i.user.id
                            });

                            await i.showModal({
                                customId: `calc_modal:${operation}`,
                                title: `Enter a number to ${operation}`,
                                components: [
                                    {
                                        type: 1,
                                        components: [
                                            {
                                                type: 4,
                                                customId: `operand:${contextKey}`,
                                                label: `Number to ${operator} with ${formattedResult}`,
                                                placeholder: "Enter a number...",
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
                                    content: "Failed to open calculator. Please try again.",
                                    flags: ["Ephemeral"],
                                }).catch(console.error);
                            }
                            return;
                        }

                    } catch (error) {
                        logger.error("Button interaction error:", error);
                        if (!i.deferred && !i.replied) {
                            await i.followUp({
                                content: "An error occurred while processing your request.",
                                flags: ["Ephemeral"],
                            }).catch(console.error);
                        }
                    }
                });

                collector.on("end", (collected, reason) => {
                    if (reason === "timeout") {
                        const disabledRow =
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(
                                        `calc_${interaction.id}_expired`,
                                    )
                                    .setLabel("Calculator Expired")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true),
                            );

                        interaction
                            .editReply({
                                components: [disabledRow],
                                content:
                                    "⏱️ This calculator has expired. Use the command again to perform more calculations.",
                            })
                            .catch(console.error);
                    } else {
                        const disabledRow = ActionRowBuilder.from(
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

                let errorMessage = 'Failed to evaluate the expression. ';

                if (error.message.includes('Unexpected type')) {
                    errorMessage +=
                        'The expression contains an unsupported operation or function.';
                } else if (error.message.includes('Undefined symbol')) {
                    errorMessage +=
                        'The expression contains an undefined variable or function.';
                } else if (error.message.includes('Brackets not balanced')) {
                    errorMessage += 'The expression has unbalanced brackets.';
                } else if (
                    error.message.includes('Unexpected operator') ||
                    error.message.includes('Unexpected character')
                ) {
                    errorMessage +=
                        'The expression contains an invalid operator or character.';
                } else {
                    errorMessage += 'Please check the syntax and try again.';
                }

                const embed = errorEmbed('Calculation Error', errorMessage);
                embed.setColor(getColor('error'));
                await interaction.editReply({
                    embeds: [embed],
                });
            }
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'calculate'
            });
        }
    },
};






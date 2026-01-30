import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Simple math expression evaluator (safe alternative to eval)
function evaluate(expression) {
    // Remove spaces and convert to lowercase
    let expr = expression.replace(/\s/g, '').toLowerCase();
    
    // Basic math functions and constants
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
    
    // Replace math functions and constants
    expr = expr.replace(/sin|cos|tan|sqrt|abs|log|log10|exp|pi|e/g, (match) => `math.${match}`);
    
    // Replace degree symbol and convert to radians
    expr = expr.replace(/(\d+)\s*deg/g, (match, num) => `(${num} * Math.PI / 180)`);
    
    // Handle power operator
    expr = expr.replace(/\^/g, '**');
    
    try {
        // Use Function constructor instead of eval for better security
        const func = new Function('math', `return ${expr}`);
        return func(math);
    } catch (error) {
        throw new Error(`Invalid expression: ${error.message}`);
    }
}

// Store calculation history (in-memory, resets on bot restart)
const calculationHistory = new Map();
const MAX_HISTORY = 5;

// Migrated from: commands/Tools/calculate.js
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
        try {
            await interaction.deferReply();

            const expression = interaction.options.getString("expression");

            // Validate the expression (basic check to prevent abuse)
            if (
                !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
            ) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Invalid Expression",
                            "The expression contains invalid characters. " +
                                "Only basic math operations, numbers, and common functions are allowed.",
                        ),
                    ],
                });
            }

            // Check for potentially dangerous expressions
            const dangerousPatterns = [
                /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
                /`/g, // Template literals
                /\$\{.*\}/, // Template literals
                /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
                /\b(?:while|for)\s*\([^)]*\)\s*\{/,
                /\b(?:function\*|yield|await|async)\b/,
            ];

            for (const pattern of dangerousPatterns) {
                if (pattern.test(expression)) {
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Security Alert",
                                "The expression contains potentially dangerous code and cannot be evaluated.",
                            ),
                        ],
                        ephemeral: true,
                    });
                }
            }

            // Evaluate the expression
            let result;
            try {
                result = evaluate(expression);

                // Format the result
                let formattedResult;
                if (typeof result === "number") {
                    // Format large numbers with commas
                    formattedResult = result.toLocaleString("en-US", {
                        maximumFractionDigits: 10,
                    });

                    // If the number is very small, use scientific notation
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

                // Add to history
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

                // Keep only the most recent calculations
                if (history.length > MAX_HISTORY) {
                    history.pop();
                }

                // Create buttons for common operations
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

                // Create the embed
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

                // Set up a collector for the buttons
                const filter = (i) =>
                    i.customId.startsWith(`calc_${interaction.id}`) &&
                    i.user.id === interaction.user.id;
                const BUTTON_TIMEOUT = 300000; // 5 minutes
                const collector =
                    interaction.channel.createMessageComponentCollector({
                        filter,
                        time: BUTTON_TIMEOUT,
                    });

                collector.on("collect", async (i) => {
                    try {
                        const operation = i.customId.split("_")[2];

                        if (operation === "history") {
                            // Defer the update for history since we're not showing a modal
                            if (!i.deferred && !i.replied) {
                                await i.deferUpdate().catch(console.error);
                            }

                            // Show calculation history
                            const userHistory =
                                calculationHistory.get(userId) || [];

                            if (userHistory.length === 0) {
                                await i.followUp({
                                    content: "No calculation history found.",
                                    ephemeral: true,
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
                                ephemeral: true,
                            });
                            return;
                        }

                        // Handle arithmetic operations - show modal first
                        let operator = "";

                        // Set operator based on operation
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

                        // Show modal first without deferring
                        try {
                            await i.showModal({
                                customId: `calc_modal_${i.user.id}_${operation}`,
                                title: `Enter a number to ${operation}`,
                                components: [
                                    {
                                        type: 1,
                                        components: [
                                            {
                                                type: 4,
                                                customId: "operand",
                                                label: `Number to ${operator} with ${formattedResult}`,
                                                placeholder:
                                                    "Enter a number...",
                                                style: 1,
                                                required: true,
                                                maxLength: 50,
                                            },
                                        ],
                                    },
                                ],
                            });
                        } catch (modalError) {
                            console.error("Failed to show modal:", modalError);
                            if (!i.replied) {
                                await i
                                    .reply({
                                        content:
                                            "Failed to open calculator. Please try again.",
                                        ephemeral: true,
                                    })
                                    .catch(console.error);
                            }
                            return;
                        }

                        try {
                            const modalResponse = await i.awaitModalSubmit({
                                filter: (m) =>
                                    m.customId ===
                                    `calc_modal_${i.user.id}_${operation}`,
                                time: 300000, // 5 minutes
                            });

                            await modalResponse.deferUpdate();

                            const operand =
                                modalResponse.fields.getTextInputValue(
                                    "operand",
                                );
                            const newExpression = `(${expression}) ${operator} (${operand})`;

                            // Calculate the new result
                            let newResult;
                            try {
                                newResult = evaluate(newExpression);
                                
                                // Format the new result
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

                                // Update the embed with new calculation
                                const updatedEmbed = successEmbed(
                                    "🧮 Calculation Result",
                                    `**Expression:** \`${newExpression.replace(/`/g, "\`")}\`\n` +
                                        `**Result:** \`${formattedNewResult}\`\n\n` +
                                        `*Use the buttons below to perform operations with the result.*`,
                                );

                                await modalResponse.editReply({
                                    embeds: [updatedEmbed],
                                });

                            } catch (calcError) {
                                await modalResponse.followUp({
                                    embeds: [errorEmbed("Calculation Error", "Failed to evaluate the new expression.")],
                                    ephemeral: true,
                                });
                            }
                        } catch (error) {
                            console.error("Modal error:", error);
                            if (!i.deferred && !i.replied) {
                                await i
                                    .followUp({
                                        content:
                                            "An error occurred while processing your input.",
                                        ephemeral: true,
                                    })
                                    .catch(console.error);
                            }
                        }
                    } catch (error) {
                        console.error("Button interaction error:", error);
                        if (!i.deferred && !i.replied) {
                            await i
                                .followUp({
                                    content:
                                        "An error occurred while processing your request.",
                                    ephemeral: true,
                                })
                                .catch(console.error);
                        }
                    }
                });

                collector.on("end", (collected, reason) => {
                    // Disable all buttons when the collector ends
                    if (reason === "timeout") {
                        // Create a new row with disabled buttons
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

                        // Edit the message to disable the buttons
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
                console.error("Calculation error:", error);

                let errorMessage = "Failed to evaluate the expression. ";

                if (error.message.includes("Unexpected type")) {
                    errorMessage +=
                        "The expression contains an unsupported operation or function.";
                } else if (error.message.includes("Undefined symbol")) {
                    errorMessage +=
                        "The expression contains an undefined variable or function.";
                } else if (error.message.includes("Brackets not balanced")) {
                    errorMessage += "The expression has unbalanced brackets.";
                } else if (
                    error.message.includes("Unexpected operator") ||
                    error.message.includes("Unexpected character")
                ) {
                    errorMessage +=
                        "The expression contains an invalid operator or character.";
                } else {
                    errorMessage += "Please check the syntax and try again.";
                }

                await interaction.editReply({
                    embeds: [errorEmbed("Calculation Error", errorMessage)],
                });
            }
        } catch (error) {
            console.error("Calculate command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Error",
                        "An error occurred while processing your calculation.",
                    ),
                ],
                ephemeral: true,
            });
        }
    },
};

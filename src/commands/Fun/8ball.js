import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const RESPONSES = {
    affirmative: [
        "Yes",
        "Certainly",
        "It is certain",
        "It is decidedly so",
        "Without a doubt",
        "Absolutely",
        "You may rely on it",
        "As I see it, yes",
        "Most likely",
        "Outlook good",
        "Signs point to yes"
    ],
    noncommittal: [
        "Reply hazy, try again",
        "Ask again later",
        "Better not tell you now",
        "Cannot predict now",
        "Concentrate and ask again",
        "Don't count on it",
        "Maybe",
        "Uncertain",
        "Possibly"
    ],
    negative: [
        "Don't count on it",
        "My reply is no",
        "My sources say no",
        "Outlook not so good",
        "Very doubtful",
        "Absolutely not",
        "No way",
        "Not a chance",
        "Forget about it"
    ]
};

export default {
    data: new SlashCommandBuilder()
        .setName("8ball")
        .setDescription("Ask the magic 8 ball a question")
        .addStringOption((option) =>
            option
                .setName("question")
                .setDescription("Your question for the magic 8 ball")
                .setRequired(true)
        ),
    category: "fun",

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`8ball interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                return;
            }

            const question = interaction.options.getString("question");

            // Get random response
            const allResponses = [
                ...RESPONSES.affirmative,
                ...RESPONSES.noncommittal,
                ...RESPONSES.negative
            ];
            const response = allResponses[Math.floor(Math.random() * allResponses.length)];

            // Determine color based on response type
            let responseType = "noncommittal";
            if (RESPONSES.affirmative.includes(response)) {
                responseType = "affirmative";
            } else if (RESPONSES.negative.includes(response)) {
                responseType = "negative";
            }

            const colors = {
                affirmative: "#00FF00",
                noncommittal: "#FFD700",
                negative: "#FF0000"
            };

            const embed = createEmbed({
                title: "🔮 Magic 8 Ball",
                description: `**Question:** ${question}\n\n**Answer:** ${response}`,
                color: colors[responseType],
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`User used 8ball`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                question,
                response
            });
        } catch (error) {
            logger.error("8ball command error:", error);
            await handleInteractionError(interaction, error, { subtype: "8ball_failed" });
        }
    }
};

import { SlashCommandBuilder, MessageFlags, type GuildTextBasedChannel } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;
export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Erstelle eine einfache Umfrage mit bis zu 10 Optionen')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Die Frage der Umfrage')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('Erste Option')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Zweite Option')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('Dritte Option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('Vierte Option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option5')
                .setDescription('Fünfte Option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option6')
                .setDescription('Sechste Option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option7')
                .setDescription('Siebte Option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option8')
                .setDescription('Achte Option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option9')
                .setDescription('Neunte Option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option10')
                .setDescription('Zehnte Option (optional)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('Umfrage anonym machen (Standard: nein)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn(`Poll interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'poll'
            });
            return;
        }

        const question = interaction.options.getString('question');
        const isAnonymous = interaction.options.getBoolean('anonymous') || false;

        const options = [];
        for (let i = 1; i <= MAX_OPTIONS; i++) {
            const option = interaction.options.getString(`option${i}`);
            if (option) options.push(option);
        }

        if (options.length < 2) {
            throw createError("You must provide at least 2 options for the poll.", ErrorTypes.VALIDATION, "Gib mindestens 2 Optionen für die Umfrage an.", { expected: true });
        }

        let description = `**${question}**\n\n`;
        options.forEach((option, index) => {
            description += `${EMOJIS[index]} ${option}\n`;
        });

        if (isAnonymous) {
            description += '\n*Das ist eine anonyme Umfrage. Stimmen werden keinen Nutzern zugeordnet.*';
        } else {
            description += '\n*Reagiere mit dem Emoji, um abzustimmen!*';
        }

        const embed = successEmbed(
            `📊 ${isAnonymous ? 'Anonyme ' : ''}Umfrage`,
            description
        );

        const message = await (interaction.channel as GuildTextBasedChannel).send({ embeds: [embed] });

        for (let i = 0; i < options.length; i++) {
            await message.react(EMOJIS[i]);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await InteractionHelper.safeEditReply(interaction, {
            content: '✅ Umfrage erstellt!',
        });
    },
} satisfies Command;
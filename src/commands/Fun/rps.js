import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CHOICES = ['rock', 'paper', 'scissors'];
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };

const OUTCOMES = {
    rock:     { rock: 'tie', paper: 'lose', scissors: 'win' },
    paper:    { rock: 'win', paper: 'tie',  scissors: 'lose' },
    scissors: { rock: 'lose', paper: 'win', scissors: 'tie' },
};

export default {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock Paper Scissors against the bot')
        .addStringOption(opt =>
            opt.setName('choice')
                .setDescription('Your choice')
                .setRequired(true)
                .addChoices(
                    { name: '🪨 Rock',     value: 'rock' },
                    { name: '📄 Paper',    value: 'paper' },
                    { name: '✂️ Scissors', value: 'scissors' },
                )
        ),

    async execute(interaction) {
        const userChoice = interaction.options.getString('choice');
        const botChoice  = CHOICES[Math.floor(Math.random() * CHOICES.length)];
        const result     = OUTCOMES[userChoice][botChoice];

        const config = {
            win:  { title: '🎉 You Win!',  color: 'success' },
            lose: { title: '😔 You Lose!', color: 'error'   },
            tie:  { title: "🤝 It's a Tie!", color: 'warning' },
        }[result];

        const embed = createEmbed({
            title: config.title,
            color: config.color,
        }).addFields(
            { name: 'Your choice', value: `${EMOJI[userChoice]} ${userChoice}`, inline: true },
            { name: 'My choice',   value: `${EMOJI[botChoice]} ${botChoice}`,  inline: true },
        );

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    },
};

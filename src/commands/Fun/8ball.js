import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const RESPONSES = [
    { text: 'It is certain.',        color: 'success' },
    { text: 'It is decidedly so.',   color: 'success' },
    { text: 'Without a doubt.',      color: 'success' },
    { text: 'Yes, definitely.',      color: 'success' },
    { text: 'You may rely on it.',   color: 'success' },
    { text: 'As I see it, yes.',     color: 'success' },
    { text: 'Most likely.',          color: 'success' },
    { text: 'Outlook good.',         color: 'success' },
    { text: 'Yes.',                  color: 'success' },
    { text: 'Signs point to yes.',   color: 'success' },
    { text: 'Reply hazy, try again.',   color: 'warning' },
    { text: 'Ask again later.',         color: 'warning' },
    { text: 'Better not tell you now.', color: 'warning' },
    { text: 'Cannot predict now.',      color: 'warning' },
    { text: 'Concentrate and ask again.', color: 'warning' },
    { text: "Don't count on it.",    color: 'error' },
    { text: 'My reply is no.',       color: 'error' },
    { text: 'My sources say no.',    color: 'error' },
    { text: 'Outlook not so good.',  color: 'error' },
    { text: 'Very doubtful.',        color: 'error' },
];

export default {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball a question')
        .addStringOption(opt =>
            opt.setName('question').setDescription('Your question').setRequired(true)
        ),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const { text, color } = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];

        const embed = createEmbed({
            title: '🎱 Magic 8-Ball',
            color,
        }).addFields(
            { name: '❓ Question', value: question },
            { name: '🎱 Answer',   value: `**${text}**` }
        );

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    },
};

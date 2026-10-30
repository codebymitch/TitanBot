import { SlashCommandBuilder } from 'discord.js';
import { startSoloGame } from '../../services/games/solo.js';
import { CC } from '../../config/cc.js';

// Solo games: `سؤال`, `رقم`, `سلوت`. A win pays a few CC, capped per day (see config/cc.js).
export default {
    abuseProtection: { enabled: true, maxAttempts: 3, windowMs: 30_000 },
    data: new SlashCommandBuilder()
        .setName('solo')
        .setDescription(`Play a solo game (a win gives ${CC.solo.win} CC)`)
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('question').setDescription('Answer one general knowledge question'))
        .addSubcommand((sub) => sub.setName('number').setDescription('Guess the number from 0 to 200 in 7 tries'))
        .addSubcommand((sub) => sub.setName('slots').setDescription('Spin the slot machine')),

    async execute(interaction, config, client) {
        await startSoloGame(interaction, client, interaction.options.getSubcommand());
    },
};

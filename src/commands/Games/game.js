import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ROUND_GAMES, ROUND_LIMITS } from '../../services/games/roundGames.js';
import { startGroupGame, stopGroupGame, buildGamesPanel } from '../../services/games/panel.js';

// Group games: the whole server can play and the top 3 win CC (more players = bigger rewards).
// `العاب` (game list) posts the games panel with a button for every game.
// Prefix words (روليت، كراسي، مافيا، غميضه، صيد، اسئلة، خمن، اسرع، فكك، رتب، حساب، العاب، وقف) are in commandAliases.js.

function addRoundsOption(subcommand, max = ROUND_LIMITS.max) {
    return subcommand.addIntegerOption((option) => option
        .setName('rounds')
        .setDescription('Number of rounds')
        .setMinValue(1)
        .setMaxValue(max)
        .setRequired(false));
}

export default {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Start a group game the whole server can play (top 3 win CC)')
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('roulette').setDescription('Roulette: the wheel picks who kicks someone out'))
        .addSubcommand((sub) => sub.setName('chairs').setDescription('Musical chairs'))
        .addSubcommand((sub) => sub.setName('mafia').setDescription('Mafia with doctor, detective and citizens'))
        .addSubcommand((sub) => sub.setName('hide').setDescription('Hide and seek: hide in a square, a random player opens one each turn'))
        .addSubcommand((sub) => sub.setName('hunt').setDescription('Hunt: one hunter, the rest are sheep hiding among fake sheep'))
        .addSubcommand((sub) => addRoundsOption(sub.setName('trivia').setDescription('General knowledge questions')))
        .addSubcommand((sub) => addRoundsOption(sub.setName('guess').setDescription('Guess the number from 0 to 200, 7 tries each'), ROUND_GAMES.guess.maxRounds))
        .addSubcommand((sub) => addRoundsOption(sub.setName('fast').setDescription('First to type the word wins the round')))
        .addSubcommand((sub) => addRoundsOption(sub.setName('fakkek').setDescription('Split the word into its letters')))
        .addSubcommand((sub) => addRoundsOption(sub.setName('scramble').setDescription('Unscramble the letters')))
        .addSubcommand((sub) => addRoundsOption(sub.setName('math').setDescription('Quick math')))
        .addSubcommand((sub) => sub.setName('list').setDescription('Open the games panel: every game with a start button'))
        .addSubcommand((sub) => sub.setName('stop').setDescription('Stop the game running in this channel')),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'list') {
            await InteractionHelper.safeReply(interaction, { ...buildGamesPanel(), allowedMentions: { parse: [] } });
            return;
        }
        if (subcommand === 'stop') {
            await stopGroupGame(interaction);
            return;
        }
        await startGroupGame(interaction, client, subcommand, interaction.options.getInteger('rounds'));
    },
};

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { soloRewardText } from '../../services/games/solo.js';
import { inviteOpponent } from '../../services/games/challenge.js';

// Tic-tac-toe between two members with buttons: `xo @member`. The other member has to accept the
// invite first; then the challenger plays ❌ and goes first.
// The winner gets solo CC (capped per day like the other solo games). A player who doesn't move
// within 20 seconds is kicked for AFK and the other player wins.
const IDLE_MS = 20_000;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const MARKS = { X: '❌', O: '⭕' };

export function findWinner(board) {
    for (const [a, b, c] of LINES) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return board.every(Boolean) ? 'draw' : null;
}

function buildRows(board, disabled = false) {
    return [0, 1, 2].map((row) => new ActionRowBuilder().addComponents(
        [0, 1, 2].map((col) => {
            const index = row * 3 + col;
            const mark = board[index];
            const button = new ButtonBuilder()
                .setCustomId(`xo_${index}`)
                .setStyle(mark === 'X' ? ButtonStyle.Danger : mark === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(disabled || Boolean(mark));
            return mark ? button.setEmoji(MARKS[mark]) : button.setLabel('​');
        }),
    ));
}

export default {
    data: new SlashCommandBuilder()
        .setName('xo')
        .setDescription('Play tic-tac-toe (XO) against another member.')
        .addUserOption((option) => option.setName('opponent').setDescription('The member to play against').setRequired(true)),
    category: 'Fun',

    async execute(interaction, config, client) {
        const playerX = interaction.user;
        const playerO = interaction.options.getUser('opponent');

        if (!playerO || playerO.id === playerX.id || playerO.bot) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [warningEmbed('❌⭕ XO', 'اختار عضو تاني تلعب معاه (مش نفسك ولا بوت).')],
            });
        }

        const board = Array(9).fill(null);
        let turn = 'X';
        const players = { X: playerX, O: playerO };
        const status = () => `${MARKS.X} ${playerX} ضد ${MARKS.O} ${playerO}\nالدور على: ${MARKS[turn]} ${players[turn]}`;

        // The other member has to accept first; the invite message then becomes the board.
        const message = await inviteOpponent(interaction, playerO, 'XO ❌⭕');
        if (!message) return;
        await message.edit({ content: status(), embeds: [], components: buildRows(board), allowedMentions: { users: [playerX.id] } });
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: IDLE_MS });

        collector.on('collect', async (button) => {
            if (![playerX.id, playerO.id].includes(button.user.id)) {
                await button.reply({ content: 'دي مش لعبتك.', flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            if (button.user.id !== players[turn].id) {
                await button.reply({ content: 'مش دورك، استنى.', flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }

            const index = Number(button.customId.split('_')[1]);
            if (board[index]) {
                await button.deferUpdate().catch(() => {});
                return;
            }
            board[index] = turn;

            const result = findWinner(board);
            if (result) {
                collector.stop('finished');
                const reward = result === 'draw' ? '' : ` ${await soloRewardText(client, interaction.guildId, players[result].id, 'xo')}`;
                const text = result === 'draw'
                    ? `${MARKS.X} ${playerX} ضد ${MARKS.O} ${playerO}\n🤝 تعادل!`
                    : `${MARKS.X} ${playerX} ضد ${MARKS.O} ${playerO}\n🏆 الفايز: ${MARKS[result]} ${players[result]}${reward}`;
                await button.update({ content: text, components: buildRows(board, true), allowedMentions: { parse: [] } }).catch(() => {});
                return;
            }

            turn = turn === 'X' ? 'O' : 'X';
            await button.update({ content: status(), components: buildRows(board), allowedMentions: { users: [players[turn].id] } }).catch(() => {});
        });

        collector.on('end', async (_collected, reason) => {
            if (reason === 'finished') return;
            const winner = players[turn === 'X' ? 'O' : 'X'];
            const reward = await soloRewardText(client, interaction.guildId, winner.id, 'xo');
            await message.edit({
                content: `${MARKS.X} ${playerX} ضد ${MARKS.O} ${playerO}\n🚫 ${players[turn]} اتطرد بسبب AFK — 🏆 الفايز: ${winner} ${reward}`,
                components: buildRows(board, true),
                allowedMentions: { parse: [] },
            }).catch(() => {});
        });
    },
};

import { SlashCommandBuilder } from 'discord.js';
import { getLeaderboard } from '../../services/cc/ccService.js';
import { CC, ccEmbed, ccBoostLine } from '../../config/cc.js';
import { MEDALS } from '../../services/games/text.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { getWealthLeaderboard } from '../../services/cc/bourseService.js';

const PAGE_SIZE = 15;

const n = (amount) => amount.toLocaleString('en-US');

/** A board line: in our server the total with its CC and holdings parts, elsewhere the CC. */
function boardLine(row, index, wealth) {
    const place = MEDALS[index] || `**#${index + 1}**`;
    if (!wealth) return `${place} <@${row.userId}> — **${n(row.cc)}** ${CC.short}`;
    const parts = row.holdings > 0 ? ` (🌀 ${n(row.cc)} + 📈 ${n(row.holdings)})` : '';
    return `${place} <@${row.userId}> — **${n(row.total)}** ${CC.short}${parts}`;
}

/**
 * The CC leaderboard (`top cc` / `cctop` / `توب cc`, the games panel and the live board in the games
 * channel). With a `userId` their rank is shown under the list; the live board passes none.
 * In our server (report #189) each member's total is their CC plus what their bourse holdings would
 * sell for right now (after the sell fee), and the board is ranked by it.
 */
export async function ccTopEmbed(client, guild, userId = null) {
    const wealth = isHomeGuild(guild.id);
    const board = wealth ? await getWealthLeaderboard(client, guild.id) : await getLeaderboard(client, guild.id);
    const lines = board.slice(0, PAGE_SIZE).map((row, index) => boardLine(row, index, wealth));
    const total = board.reduce((sum, row) => sum + (wealth ? row.total : row.cc), 0);
    const summary = [`👥 ${board.length} عضو`, `🌀 ${n(total)} ${CC.short} في السيرفر`];
    if (userId) {
        const rank = board.findIndex((row) => row.userId === userId) + 1;
        summary.unshift(`👤 ترتيبك: ${rank ? `**#${rank}**` : '—'}`);
    }

    return ccEmbed(`${CC.emoji} Top CC — ${guild.name}`, [
        lines.join('\n') || 'لسه محدش معاه CC. العبوا واكسبوا!',
        '',
        ...(wealth ? ['🌀 الرصيد + 📈 الممتلكات لو اتباعت دلوقتي (بعد الضريبة)', ''] : []),
        summary.join(' • '),
        ...(ccBoostLine() ? ['', ccBoostLine()] : []),
    ].join('\n'));
}

export default {
    data: new SlashCommandBuilder()
        .setName('cctop')
        .setDescription(`${CC.name} (${CC.short}) leaderboard`)
        .setDMPermission(false),

    async execute(interaction, config, client) {
        const embed = await ccTopEmbed(client, interaction.guild, interaction.user.id);
        await InteractionHelper.safeReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    },
};

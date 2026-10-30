// panel.js — starting and stopping group games (shared by `/game` and the games panel) and the
// `العاب` panel: an embed that explains every game plus a button for each one.
// The panel's buttons are handled by src/interactions/buttons/games/gamesPanel.js, so they keep
// working after restarts.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { withChannelGame, getActiveGame, rewardsLine, canControlGame } from './session.js';
import { ROUND_GAMES, runRoundGame } from './roundGames.js';
import { runRoulette, ROULETTE_LIMITS } from './roulette.js';
import { runChairs, CHAIRS_LIMITS } from './chairs.js';
import { runMafia, MAFIA_LIMITS } from './mafia.js';
import { runHideAndSeek, runHunt, HIDE_LIMITS, HUNT_LIMITS } from './hideGames.js';
import { CC, ccEmbed, soloDailyCap } from '../../config/cc.js';

export const PANEL_BUTTON_PREFIX = 'gamespanel';
const STOP_NOTICE_MS = 5_000;

const LOBBY_GAMES = {
    roulette: { run: runRoulette, name: 'روليت' },
    chairs: { run: runChairs, name: 'كراسي' },
    mafia: { run: runMafia, name: 'مافيا' },
    hide: { run: runHideAndSeek, name: 'غميضه' },
    hunt: { run: runHunt, name: 'صيد' },
};

export function isGroupGame(key) {
    return Boolean(LOBBY_GAMES[key] || ROUND_GAMES[key]);
}

/** Starts group game `key` in the interaction's channel (`rounds` only matters for chat games). */
export async function startGroupGame(interaction, client, key, rounds = null) {
    if (!interaction.channel?.isTextBased?.()) return;
    const lobbyGame = LOBBY_GAMES[key];
    if (lobbyGame) {
        await withChannelGame(interaction, lobbyGame.name, (session) => lobbyGame.run(interaction, client, session));
        return;
    }
    if (ROUND_GAMES[key]) {
        await withChannelGame(interaction, ROUND_GAMES[key].title, (session) => runRoundGame(interaction, client, session, key, rounds));
    }
}

/** `وقف`: stops the channel's game when asked by its host or a trusted member. */
export async function stopGroupGame(interaction) {
    const running = getActiveGame(interaction.channel?.id);
    if (!running) {
        await InteractionHelper.safeReply(interaction, { content: 'مفيش لعبة شغالة في الروم ده.', flags: MessageFlags.Ephemeral });
        return;
    }
    if (!await canControlGame(interaction.guild, interaction.user.id, running)) {
        await InteractionHelper.safeReply(interaction, { content: 'صاحب اللعبة أو التراست بس اللي يقدروا يوقفوها.', flags: MessageFlags.Ephemeral });
        return;
    }
    running.stop();
    await InteractionHelper.safeReply(interaction, { content: `🛑 ${interaction.user} وقف اللعبة.`, allowedMentions: { parse: [] } });
    // The stopped game's messages are deleted by withChannelGame; this notice and the `وقف` go too.
    const notice = await interaction.fetchReply?.().catch(() => null);
    setTimeout(() => {
        notice?.delete().catch(() => {});
        if (interaction._sourceMessage && interaction._sourceMessage.id !== notice?.id) interaction._sourceMessage.delete().catch(() => {});
    }, STOP_NOTICE_MS);
}

// The panel. Each row is one kind of game, with the same colour as its section in the embed:
// 🔵 blue = join with buttons, 🟢 green = chat games anyone can answer, ⚪ grey = solo, then CC.
const PANEL_ROWS = [
    [
        ['roulette', 'روليت', '🎡', ButtonStyle.Primary],
        ['chairs', 'كراسي', '🪑', ButtonStyle.Primary],
        ['mafia', 'مافيا', '🕵️', ButtonStyle.Primary],
        ['hide', 'غميضه', '🙈', ButtonStyle.Primary],
        ['hunt', 'صيد', '🏹', ButtonStyle.Primary],
    ],
    [
        ['trivia', 'أسئلة', '❓', ButtonStyle.Success],
        ['guess', 'خمن', '🔢', ButtonStyle.Success],
        ['fast', 'أسرع', '⚡', ButtonStyle.Success],
        ['fakkek', 'فكك', '✂️', ButtonStyle.Success],
        ['scramble', 'رتب', '🔀', ButtonStyle.Success],
    ],
    [
        ['math', 'حساب', '🧮', ButtonStyle.Success],
        ['solo_question', 'سؤال', '❔', ButtonStyle.Secondary],
        ['solo_number', 'رقم', '🎯', ButtonStyle.Secondary],
        ['solo_slots', 'سلوت', '🎰', ButtonStyle.Secondary],
        ['rps', 'حجر ورقة مقص', '✊', ButtonStyle.Secondary],
    ],
    [
        ['balance', 'رصيدي', '💰', ButtonStyle.Secondary],
        ['top', 'توب CC', '🏆', ButtonStyle.Secondary],
        ['stop', 'وقف اللعبة', '🛑', ButtonStyle.Danger],
    ],
];

export const PANEL_ACTIONS = PANEL_ROWS.flat().map(([action]) => action);

export function buildGamesPanel() {
    const embed = ccEmbed(`🎮 ألعاب السيرفر — ${CC.emoji} ${CC.name}`, [
        'دوس على أي زرار تحت عشان تبدأ اللعبة على طول، أو اكتب اسمها في الشات.',
        `الألعاب هي الطريقة الوحيدة تجمع بيها **${CC.short}**!`,
    ].join('\n'), {
        fields: [
            {
                name: '🔵 ألعاب بالانضمام — ادخل بالزرار',
                value: [
                    `🎡 **روليت** — العجلة بتختار مين يطلّع مين، آخر واحد يكسب \`${ROULETTE_LIMITS.min}-${ROULETTE_LIMITS.max}\``,
                    `🪑 **كراسي** — اقعد لما تنور 🟢، ولو دوست على 🔴 تخسر \`${CHAIRS_LIMITS.min}-${CHAIRS_LIMITS.max}\``,
                    `🕵️ **مافيا** — مافيا ودكتور ومحقق ومواطنين \`${MAFIA_LIMITS.min}-${MAFIA_LIMITS.max}\``,
                    `🙈 **غميضه** — استخبى في مربع، ولاعب عشوائي كل دور يفتح مربع \`${HIDE_LIMITS.min}-${HIDE_LIMITS.max}\``,
                    `🏹 **صيد** — صياد ضد خرفان مستخبية وسط خرفان وهمية \`${HUNT_LIMITS.min}-${HUNT_LIMITS.max}\``,
                ].join('\n'),
            },
            {
                name: '🟢 ألعاب الشات — السيرفر كله يجاوب',
                value: [
                    '❓ **أسئلة** — أسئلة عامة',
                    '🔢 **خمن** — خمن الرقم من 0 لـ 200، 7 محاولات لكل واحد',
                    '⚡ **أسرع** — أول واحد يكتب الكلمة',
                    '✂️ **فكك** — فكك الكلمة لحروف',
                    '🔀 **رتب** — رتب الحروف',
                    '🧮 **حساب** — حساب سريع',
                ].join('\n'),
            },
            {
                name: `⚪ ألعاب فردية — ${CC.solo.win} ${CC.short} للفوز`,
                value: [
                    '❔ **سؤال** — سؤال واحد ومحاولة واحدة',
                    '🎯 **رقم** — خمن من 0 لـ 200 في 7 محاولات',
                    '🎰 **سلوت** — 3 زي بعض تكسب',
                    '✊ **حجر ورقة مقص** — ضد البوت',
                    '❌ **اكس @عضو** — XO ضد عضو',
                    Number.isFinite(soloDailyCap()) ? `الحد: **${soloDailyCap().toLocaleString('en-US')} ${CC.short}** في اليوم` : 'من غير حد يومي',
                ].join('\n'),
            },
            {
                name: '🏆 جوايز الجماعي (أعلى 3)',
                value: [
                    `👥 3 ← ${rewardsLine(3)}`,
                    `👥 10 ← ${rewardsLine(10)}`,
                    `👥 30+ ← ${rewardsLine(30)}`,
                ].join('\n'),
                inline: true,
            },
            {
                name: `${CC.emoji} العملات`,
                value: [
                    '💰 **رصيد** — رصيدك وإحصائياتك',
                    '🏆 **top cc** — الترتيب',
                    '🛑 **وقف** — يوقف اللعبة (صاحبها أو التراست)',
                ].join('\n'),
                inline: true,
            },
        ],
    });
    embed.footer = { text: 'لعبة جماعية واحدة في كل روم • اكتب العاب عشان تفتح اللوحة دي تاني' };

    const components = PANEL_ROWS.map((row) => new ActionRowBuilder().addComponents(
        row.map(([action, label, emoji, style]) => new ButtonBuilder()
            .setCustomId(`${PANEL_BUTTON_PREFIX}:${action}`)
            .setLabel(label)
            .setEmoji(emoji)
            .setStyle(style)),
    ));
    return { embeds: [embed], components };
}

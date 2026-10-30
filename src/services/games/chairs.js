// chairs.js — `كراسي`: every round shows one chair less than players, greyed out so nobody can press
// them. At random moments the chairs flash 🔴 red (a trap: pressing one then knocks you out) and
// finally turn 🟢 green: then everyone races to sit. Whoever doesn't get a chair is out, and whoever
// never presses while they are green is kicked for AFK. Last one sitting wins.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { gameEmbed, runLobby, stopOnAbort, wait, finishGroupGame, sendGameMessage } from './session.js';
import { shuffle } from './text.js';

const TITLE = '🪑 كراسي';
const SIT_MS = 20_000;
export const CHAIRS_LIMITS = { min: 3, max: 25 };

/**
 * The random timing of one round: 0–2 red flashes, each after a random wait, then the random wait
 * before the chairs turn green. All in milliseconds.
 */
export function planRound(random = Math.random) {
    const between = (min, max) => Math.floor(random() * (max - min + 1)) + min;
    const flashes = Array.from({ length: between(0, 2) }, () => ({ waitMs: between(2000, 6000), redMs: between(1500, 3000) }));
    return { flashes, greenAfterMs: between(2000, 7000) };
}

const STYLES = { wait: ButtonStyle.Secondary, red: ButtonStyle.Danger, green: ButtonStyle.Success, done: ButtonStyle.Secondary };

/** `wait` and `done`: grey and not pressable. `red` and `green`: pressable. Taken chairs show who sits there. */
export function chairButton(index, phase, taken) {
    const button = new ButtonBuilder().setCustomId(`chair_${index}`).setEmoji('🪑');
    if (taken) return button.setLabel((taken.globalName || taken.username).slice(0, 80)).setStyle(ButtonStyle.Primary).setDisabled(true);
    return button.setLabel(`${index + 1}`).setStyle(STYLES[phase]).setDisabled(phase === 'wait' || phase === 'done');
}

function chairRows(chairs, seats, phase) {
    const buttons = Array.from({ length: chairs }, (_, index) => chairButton(index, phase, seats.get(index)));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return rows;
}

/** Final order from the rounds: survivors first, then each round's losers, the latest round first. */
export function rankChairs(survivors, roundsOut) {
    return [...survivors, ...[...roundsOut].reverse().flatMap((round) => shuffle(round))];
}

const list = (users) => users.map((user) => `${user}`).join('، ');

async function playRound(channel, session, alive, round) {
    const plan = planRound();
    const seats = new Map();
    const seated = new Set();
    const tried = new Set();
    const redOut = [];
    let chairs = alive.length - 1;
    let phase = 'wait';
    let greenDone = null;

    const headline = {
        wait: '⏳ **استعد...**',
        red: '🔴🔴🔴',
        green: `🟢 **اقعد!** ⏱️ ${SIT_MS / 1000} ثانية`,
    };
    const render = () => gameEmbed(`${TITLE} — الجولة ${round}`, [
        headline[phase] || '',
        '',
        `👥 ${list(alive.filter((user) => !redOut.includes(user)))}`,
        redOut.length ? `🔴 داسوا على الأحمر وخرجوا: ${list(redOut)}` : null,
        phase === 'wait' && round === 1 ? '\n🟢 اقعد لما الكراسي تنور أخضر • 🔴 لو دوست وهي حمرا بتخسر' : null,
    ].filter((line) => line !== null).join('\n'));
    const show = () => ({ embeds: [render()], components: chairRows(chairs, seats, phase) });

    const message = await sendGameMessage(session, channel, show());
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button });
    stopOnAbort(collector, session.signal);
    collector.on('collect', async (button) => {
        const ephemeral = (content) => button.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
        const player = alive.find((user) => user.id === button.user.id);
        if (!player) return ephemeral('انت مش في اللعبة دي.');
        if (redOut.includes(player)) return ephemeral('🔴 انت خسرت الجولة دي.');

        if (phase === 'red') {
            redOut.push(player);
            return button.update(show()).catch(() => {});
        }
        // A press that arrives after the chairs went grey again does nothing.
        if (phase !== 'green') return button.deferUpdate().catch(() => {});

        tried.add(player.id);
        if (seated.has(player.id)) return ephemeral('انت قاعد خلاص 😄');
        const index = Number(button.customId.split('_')[1]);
        if (!Number.isInteger(index) || index < 0 || index >= chairs) return button.deferUpdate().catch(() => {});
        if (seats.has(index) || seats.size >= chairs) return ephemeral('الكرسي ده اتاخد! شوف غيره بسرعة.');
        seats.set(index, player);
        seated.add(player.id);
        if (seats.size >= chairs) greenDone?.();
        await button.update(show()).catch(() => {});
    });

    const setPhase = async (next) => {
        phase = next;
        await message.edit(show()).catch(() => {});
    };

    for (const flash of plan.flashes) {
        await wait(flash.waitMs, session.signal);
        if (session.signal.aborted) break;
        await setPhase('red');
        await wait(flash.redMs, session.signal);
        await setPhase('wait');
    }
    await wait(plan.greenAfterMs, session.signal);

    const remaining = alive.filter((user) => !redOut.includes(user));
    if (!session.signal.aborted && remaining.length > 1) {
        chairs = remaining.length - 1;
        await setPhase('green');
        // Green lasts until every chair is taken, SIT_MS passes or the game is stopped.
        await new Promise((resolve) => {
            const done = () => {
                clearTimeout(timer);
                session.signal.removeEventListener('abort', done);
                resolve();
            };
            const timer = setTimeout(done, SIT_MS);
            greenDone = done;
            session.signal.addEventListener('abort', done, { once: true });
        });
    }
    phase = 'done';
    collector.stop();
    if (session.signal.aborted) return null;

    // Nobody left to race (everyone else pressed red): whoever is still in goes through.
    const survivors = remaining.length > 1 ? remaining.filter((user) => seated.has(user.id)) : remaining;
    const out = remaining.filter((user) => !survivors.includes(user));
    const afk = out.filter((user) => !tried.has(user.id));
    const lost = out.filter((user) => tried.has(user.id));
    await message.edit({
        embeds: [gameEmbed(`${TITLE} — الجولة ${round}`, [
            redOut.length ? `🔴 داسوا على الأحمر: ${list(redOut)}` : null,
            lost.length ? `❌ مالحقش كرسي: ${list(lost)}` : null,
            afk.length ? `🚫 اتطرد بسبب AFK: ${list(afk)}` : null,
            !redOut.length && !out.length ? '❌ محدش طلع' : null,
            `✅ فضلوا: ${survivors.length}`,
        ].filter(Boolean).join('\n'))],
        components: chairRows(chairs, seats, 'done'),
    }).catch(() => {});
    return { survivors, out: [...redOut, ...out] };
}

export async function runChairs(interaction, client, session) {
    const players = await runLobby(interaction, session, {
        title: TITLE,
        description: 'الكراسي بتظهر رمادي ومحدش يقدر يدوس عليها.\n🟢 لما تنور أخضر اقعد بسرعة، والكراسي أقل من اللاعبين بواحد.\n🔴 لو نورت أحمر ودوست عليها بتخسر وتطلع.',
        minPlayers: CHAIRS_LIMITS.min,
        maxPlayers: CHAIRS_LIMITS.max,
    });
    if (!players) return;

    const channel = interaction.channel;
    let alive = [...players];
    const roundsOut = [];
    let round = 0;

    while (alive.length > 1 && !session.signal.aborted) {
        round += 1;
        const result = await playRound(channel, session, alive, round);
        if (!result) break;
        alive = result.survivors;
        roundsOut.push(result.out.map((user) => user.id));
        if (alive.length > 1) await wait(2500, session.signal);
    }

    // Stopped with `وقف`: withChannelGame deletes the game's messages.
    if (session.signal.aborted) return;

    const ranking = rankChairs(alive.map((user) => user.id), roundsOut);
    await finishGroupGame(client, channel, {
        game: 'chairs',
        title: TITLE,
        ranking,
        playerIds: players.map((user) => user.id),
        summary: alive.length ? `👑 ${alive[0]} قعد على آخر كرسي!` : 'محدش فضل في آخر جولة!',
    });
}

// roulette.js — `روليت`: players join, the wheel lands on someone who kicks another player out (or
// withdraws). Whoever the wheel lands on and doesn't pick in time is out. Last one standing wins.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { gameEmbed, runLobby, stopOnAbort, wait, finishGroupGame, sendGameMessage } from './session.js';
import { pick } from './text.js';

const TITLE = '🎡 روليت';
const TURN_MS = 20_000;
export const ROULETTE_LIMITS = { min: 3, max: 20 };

function turnRows(alive, chosen, disabled = false) {
    const buttons = alive
        .filter((user) => user.id !== chosen.id)
        .map((user) => new ButtonBuilder()
            .setCustomId(`roulette_kick_${user.id}`)
            .setLabel((user.globalName || user.username).slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled));
    buttons.push(
        new ButtonBuilder().setCustomId('roulette_random').setLabel('عشوائي').setEmoji('🎲').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('roulette_quit').setLabel('انسحاب').setEmoji('🏳️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    );
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return rows;
}

/** The chosen player's pick → the player who goes out. */
export function resolveRouletteChoice(choice, alive, chosen, random = pick) {
    if (choice === 'roulette_quit' || !choice) return chosen;
    const others = alive.filter((user) => user.id !== chosen.id);
    if (choice === 'roulette_random') return random(others);
    const targetId = choice.replace('roulette_kick_', '');
    return others.find((user) => user.id === targetId) || chosen;
}

export async function runRoulette(interaction, client, session) {
    const players = await runLobby(interaction, session, {
        title: TITLE,
        description: 'ادخلوا الروليت! كل جولة العجلة بتقف على لاعب، واللاعب ده بيختار مين يطلع من اللعبة. آخر واحد يفضل هو الفايز.',
        minPlayers: ROULETTE_LIMITS.min,
        maxPlayers: ROULETTE_LIMITS.max,
    });
    if (!players) return;

    const channel = interaction.channel;
    let alive = [...players];
    const out = [];

    while (alive.length > 1 && !session.signal.aborted) {
        const chosen = pick(alive);
        const message = await sendGameMessage(session, channel, { embeds: [gameEmbed(TITLE, `🎡 العجلة بتلف... (${alive.length} لاعبين)`)] });
        await wait(2500, session.signal);
        if (session.signal.aborted) break;
        await message.edit({
            content: `${chosen}`,
            embeds: [gameEmbed(TITLE, `🎯 العجلة وقفت على ${chosen}!\nاختار حد يطلع من اللعبة، أو 🎲 عشوائي، أو 🏳️ انسحب.\n⏱️ عندك ${TURN_MS / 1000} ثانية، ولو ما اخترتش هتتطرد AFK.`)],
            components: turnRows(alive, chosen),
            allowedMentions: { users: [chosen.id] },
        });

        const choice = await new Promise((resolve) => {
            const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: TURN_MS });
            stopOnAbort(collector, session.signal);
            collector.on('collect', async (button) => {
                if (button.user.id !== chosen.id) {
                    await button.reply({ content: 'مش دورك، العجلة وقفت على حد تاني.', flags: MessageFlags.Ephemeral }).catch(() => {});
                    return;
                }
                await button.deferUpdate().catch(() => {});
                collector.stop('picked');
                resolve(button.customId);
            });
            collector.on('end', (_collected, reason) => {
                if (reason !== 'picked') resolve(null);
            });
        });
        if (session.signal.aborted) break;

        const loser = resolveRouletteChoice(choice, alive, chosen);
        alive = alive.filter((user) => user.id !== loser.id);
        out.push(loser);
        const reason = !choice ? `🚫 ${chosen} اتطرد بسبب AFK.`
            : loser.id === chosen.id ? `🏳️ ${chosen} انسحب.`
                : `💥 ${chosen} طلّع ${loser}${choice === 'roulette_random' ? ' (عشوائي)' : ''}!`;
        await message.edit({
            content: null,
            embeds: [gameEmbed(TITLE, `${reason}\n\n👥 الباقيين (${alive.length}): ${alive.map((user) => `${user}`).join('، ')}`)],
            components: [],
            allowedMentions: { parse: [] },
        }).catch(() => {});
        if (alive.length > 1) await wait(2000, session.signal);
    }

    // Stopped with `وقف`: withChannelGame deletes the game's messages.
    if (session.signal.aborted) return;

    const ranking = [alive[0].id, ...out.reverse().map((user) => user.id)];
    await finishGroupGame(client, channel, {
        game: 'roulette',
        title: TITLE,
        ranking,
        playerIds: players.map((user) => user.id),
        summary: `👑 ${alive[0]} هو آخر واحد فضل في الروليت!`,
    });
}

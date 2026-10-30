// mafia.js — `مافيا`, kept simple: one short message per phase, every phase lasts 20 seconds.
//   Start: everyone presses 🎭 and sees their own role privately (ephemeral).
//   Night: the mafia pick someone to kill, the doctor someone to save, the detective someone to check,
//          each through a private menu behind the 🌙 button.
//   Day:   everyone alive votes someone out (a tie or "skip" means nobody).
// Whoever doesn't press / pick / vote in time is kicked for AFK (their role is shown).
// Town wins when every mafia member is out; the mafia win when they are as many as the town.
// The winning team gets the CC: alive winners first, then the dead ones (never the AFK ones).

import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, StringSelectMenuBuilder,
} from 'discord.js';
import { gameEmbed, runLobby, stopOnAbort, wait, finishGroupGame, sendGameMessage } from './session.js';
import { shuffle, pick } from './text.js';

const TITLE = '🕵️ مافيا';
export const PHASE_MS = 20_000;
const MAX_ROUNDS = 12;
export const MAFIA_LIMITS = { min: 5, max: 20 };

export const ROLES = {
    mafia: { name: 'مافيا', emoji: '🔪', team: 'mafia', info: 'كل ليلة انت وباقي المافيا بتختاروا حد تقتلوه. خليك مستخبي الصبح!' },
    doctor: { name: 'دكتور', emoji: '💉', team: 'town', info: 'كل ليلة بتختار حد تحميه من المافيا (ممكن نفسك).' },
    detective: { name: 'محقق', emoji: '🔎', team: 'town', info: 'كل ليلة بتختار حد وتعرف هو مافيا ولا لأ.' },
    citizen: { name: 'مواطن', emoji: '👤', team: 'town', info: 'ملكش قدرة بالليل، بس صوتك الصبح هو اللي بيطلع المافيا.' },
};

/** Role list for `count` players: 1 mafia per 4 players (at least 1), a doctor, and a detective from 6 players. */
export function assignRoles(playerIds, shuffleFn = shuffle) {
    const count = playerIds.length;
    const mafiaCount = Math.max(1, Math.floor(count / 4));
    const roles = [...Array(mafiaCount).fill('mafia'), 'doctor'];
    if (count >= 6) roles.push('detective');
    while (roles.length < count) roles.push('citizen');
    const order = shuffleFn(playerIds);
    return new Map(order.map((id, index) => [id, roles[index]]));
}

export function checkWinner(roles, aliveIds) {
    const mafia = aliveIds.filter((id) => roles.get(id) === 'mafia').length;
    const town = aliveIds.length - mafia;
    if (mafia === 0) return 'town';
    if (mafia >= town) return 'mafia';
    return null;
}

/** Most voted ID; null on a tie, no votes, or when "skip" wins. */
export function tallyVotes(votes, { allowTie = false, random = pick } = {}) {
    const counts = new Map();
    for (const target of votes.values()) counts.set(target, (counts.get(target) || 0) + 1);
    if (!counts.size) return null;
    const top = Math.max(...counts.values());
    const leaders = [...counts.entries()].filter(([, n]) => n === top).map(([id]) => id);
    if (leaders.length > 1 && !allowTie) return null;
    const winner = leaders.length > 1 ? random(leaders) : leaders[0];
    return winner === 'skip' ? null : winner;
}

function mention(id) {
    return `<@${id}>`;
}

function describeRole(id, roles) {
    const role = ROLES[roles.get(id)];
    return `${role.emoji} ${role.name}`;
}

function button(customId, label, emoji, style = ButtonStyle.Primary) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel(label).setEmoji(emoji).setStyle(style));
}

function targetMenu(customId, placeholder, ids, names, { skip = false } = {}) {
    const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder)
        .addOptions(ids.map((id) => ({ label: names.get(id).slice(0, 100), value: id })));
    if (skip) menu.addOptions({ label: 'تخطي', value: 'skip', emoji: '⏭️' });
    return new ActionRowBuilder().addComponents(menu);
}

function roleText(userId, roles) {
    const roleKey = roles.get(userId);
    const role = ROLES[roleKey];
    const partners = roleKey === 'mafia'
        ? `\n🤝 معاك: ${[...roles.entries()].filter(([id, r]) => r === 'mafia' && id !== userId).map(([id]) => mention(id)).join('، ') || 'لوحدك'}`
        : '';
    return `دورك: **${role.emoji} ${role.name}**\n${role.info}${partners}`;
}

const ephemeral = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});

/** Removes the members who didn't act in time and returns the line announcing it. */
export function kickAfk(state, afkIds) {
    if (!afkIds.length) return '';
    state.alive = state.alive.filter((id) => !afkIds.includes(id));
    afkIds.forEach((id) => state.afk.add(id));
    return afkIds.map((id) => `🚫 ${mention(id)} اتطرد بسبب AFK (كان ${describeRole(id, state.roles)})`).join('\n');
}

/** Start: everyone presses 🎭 to see their role privately; whoever doesn't is kicked. */
async function revealRoles(channel, session, state) {
    const seen = new Set();
    const message = await sendGameMessage(session, channel, {
        content: state.alive.map(mention).join(' '),
        embeds: [gameEmbed(TITLE, `دوس 🎭 عشان تشوف دورك، محدش غيرك هيشوفه.\n⏱️ ${PHASE_MS / 1000} ثانية — اللي مايدوسش بيطلع AFK.`)],
        components: [button('mafia_role', 'دوري', '🎭')],
        allowedMentions: { users: state.alive },
    });
    await new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: PHASE_MS });
        stopOnAbort(collector, session.signal);
        collector.on('collect', async (interaction) => {
            if (!state.roles.has(interaction.user.id)) return ephemeral(interaction, 'انت مش في اللعبة دي.');
            seen.add(interaction.user.id);
            await ephemeral(interaction, roleText(interaction.user.id, state.roles));
            if (state.alive.every((id) => seen.has(id))) collector.stop('done');
        });
        collector.on('end', resolve);
    });
    if (session.signal.aborted) return;
    const afk = kickAfk(state, state.alive.filter((id) => !seen.has(id)));
    const mafiaCount = [...state.roles.values()].filter((role) => role === 'mafia').length;
    await message.edit({
        content: null,
        embeds: [gameEmbed(TITLE, [`✅ الأدوار اتوزعت — 🔪 المافيا: **${mafiaCount}**`, afk].filter(Boolean).join('\n'))],
        components: [],
        allowedMentions: { parse: [] },
    }).catch(() => {});
}

async function runNight(channel, session, state, night) {
    const { roles, names } = state;
    const alive = [...state.alive];
    const actors = alive.filter((id) => roles.get(id) !== 'citizen');
    const mafiaVotes = new Map();
    const acted = new Set();
    let saved = null;

    const message = await sendGameMessage(session, channel, {
        embeds: [gameEmbed(`🌙 الليلة ${night}`, `المافيا والدكتور والمحقق: دوسوا 🌙 واختاروا.\n⏱️ ${PHASE_MS / 1000} ثانية — اللي مايختارش بيطلع AFK.`)],
        components: [button('mafia_act', 'اختار', '🌙')],
    });

    await new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: PHASE_MS });
        stopOnAbort(collector, session.signal);
        collector.on('collect', async (interaction) => {
            const userId = interaction.user.id;
            const roleKey = roles.get(userId);
            if (!roleKey) return ephemeral(interaction, 'انت مش في اللعبة دي.');
            if (!alive.includes(userId)) return ephemeral(interaction, '💀 انت برا اللعبة.');
            if (roleKey === 'citizen') return ephemeral(interaction, '👤 انت مواطن، نام 😴');
            if (acted.has(userId)) return ephemeral(interaction, '✅ اخترت خلاص.');

            const targets = roleKey === 'mafia' ? alive.filter((id) => roles.get(id) !== 'mafia')
                : roleKey === 'detective' ? alive.filter((id) => id !== userId) : alive;
            const customId = `mafia_pick_${session.startedAt}_${night}_${userId}`;
            const prompt = { mafia: '🔪 تقتلوا مين؟', doctor: '💉 تحمي مين؟', detective: '🔎 تكشف مين؟' }[roleKey];
            await interaction.reply({ content: `${describeRole(userId, roles)} — ${prompt}`, components: [targetMenu(customId, prompt, targets, names)], flags: MessageFlags.Ephemeral }).catch(() => {});

            const selection = await channel.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                filter: (component) => component.customId === customId && component.user.id === userId,
                time: Math.max(1000, PHASE_MS - (Date.now() - message.createdTimestamp)),
            }).catch(() => null);
            if (!selection || session.signal.aborted || acted.has(userId)) return;
            const target = selection.values[0];
            acted.add(userId);
            let reply = `✅ اخترت ${names.get(target)}.`;
            if (roleKey === 'mafia') mafiaVotes.set(userId, target);
            if (roleKey === 'doctor') saved = target;
            if (roleKey === 'detective') reply = `🔎 ${names.get(target)}: ${roles.get(target) === 'mafia' ? '**مافيا** 🔪' : '**مش مافيا** ✅'}`;
            await selection.update({ content: reply, components: [] }).catch(() => {});
            if (actors.every((id) => acted.has(id))) collector.stop('done');
        });
        collector.on('end', resolve);
    });
    await message.edit({ components: [] }).catch(() => {});
    if (session.signal.aborted) return null;

    const lines = [];
    const target = tallyVotes(mafiaVotes, { allowTie: true });
    if (!target) lines.push('😶 محدش مات الليلة دي.');
    else if (target === saved) lines.push('💉 الدكتور أنقذ حد من المافيا!');
    else {
        state.alive = state.alive.filter((id) => id !== target);
        state.dead.push(target);
        lines.push(`💀 ${mention(target)} اتقتل (كان ${describeRole(target, roles)})`);
    }
    lines.push(kickAfk(state, actors.filter((id) => !acted.has(id) && state.alive.includes(id))));
    return { text: lines.filter(Boolean).join('\n') };
}

async function runDay(channel, session, state, day, morning) {
    const { roles, names } = state;
    const alive = [...state.alive];
    const votes = new Map();
    const render = () => gameEmbed(`☀️ اليوم ${day}`, [
        morning,
        '',
        `🗳️ صوتوا مين المافيا — ⏱️ ${PHASE_MS / 1000} ثانية (اللي مايصوتش بيطلع AFK)`,
        `👥 ${alive.map(mention).join('، ')}`,
        `✅ صوّت: **${votes.size}/${alive.length}**`,
    ].join('\n'));
    const message = await sendGameMessage(session, channel, {
        content: alive.map(mention).join(' '),
        embeds: [render()],
        components: [targetMenu(`mafia_vote_${day}`, '🗳️ صوت على...', alive, names, { skip: true })],
        allowedMentions: { users: alive },
    });

    await new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: PHASE_MS });
        stopOnAbort(collector, session.signal);
        collector.on('collect', async (interaction) => {
            if (!alive.includes(interaction.user.id)) return ephemeral(interaction, 'اللي في اللعبة بس يصوتوا.');
            const choice = interaction.values[0];
            votes.set(interaction.user.id, choice);
            await ephemeral(interaction, `🗳️ صوتك: ${choice === 'skip' ? 'تخطي' : names.get(choice)} (تقدر تغيره)`);
            await message.edit({ embeds: [render()] }).catch(() => {});
            if (votes.size === alive.length) collector.stop('done');
        });
        collector.on('end', resolve);
    });
    await message.edit({ components: [] }).catch(() => {});
    if (session.signal.aborted) return;

    const lines = [];
    const outId = tallyVotes(votes);
    if (!outId) lines.push('⚖️ محدش طلع النهارده.');
    else {
        state.alive = state.alive.filter((id) => id !== outId);
        state.dead.push(outId);
        lines.push(`🪓 ${mention(outId)} طلع بالتصويت (كان ${describeRole(outId, roles)})`);
    }
    lines.push(kickAfk(state, alive.filter((id) => !votes.has(id) && state.alive.includes(id))));
    await sendGameMessage(session, channel, { content: lines.filter(Boolean).join('\n'), allowedMentions: { parse: [] } });
}

export async function runMafia(interaction, client, session) {
    const players = await runLobby(interaction, session, {
        title: TITLE,
        description: 'كل واحد بياخد دور سري: 🔪 مافيا • 💉 دكتور • 🔎 محقق • 👤 مواطن.\nالمواطنين يكشفوا المافيا بالتصويت قبل ما المافيا تخلص عليهم.',
        minPlayers: MAFIA_LIMITS.min,
        maxPlayers: MAFIA_LIMITS.max,
        waitMs: 90_000,
    });
    if (!players) return;

    const channel = interaction.channel;
    const ids = players.map((user) => user.id);
    const state = {
        roles: assignRoles(ids),
        names: new Map(players.map((user) => [user.id, user.globalName || user.username])),
        alive: [...ids],
        dead: [],
        afk: new Set(),
    };

    await revealRoles(channel, session, state);
    let winner = session.signal.aborted ? null : checkWinner(state.roles, state.alive);
    if (!winner) await wait(3000, session.signal);

    for (let round = 1; round <= MAX_ROUNDS && !winner && !session.signal.aborted; round += 1) {
        const night = await runNight(channel, session, state, round);
        if (!night) break;
        winner = checkWinner(state.roles, state.alive);
        if (winner) {
            await sendGameMessage(session, channel, { content: night.text, allowedMentions: { parse: [] } });
            break;
        }
        await runDay(channel, session, state, round, night.text);
        winner = checkWinner(state.roles, state.alive);
        if (!winner) await wait(3000, session.signal);
    }

    // Stopped with `وقف`: withChannelGame deletes the game's messages.
    if (session.signal.aborted) return;

    const status = (id) => (state.afk.has(id) ? ' 🚫' : state.alive.includes(id) ? '' : ' 💀');
    const reveal = ids.map((id) => `${describeRole(id, state.roles)} — ${mention(id)}${status(id)}`).join('\n');
    if (!winner) {
        await finishGroupGame(client, channel, { game: 'mafia', title: TITLE, ranking: [], playerIds: ids, summary: `⌛ اللعبة طولت ومحدش كسب.\n\n${reveal}` });
        return;
    }
    const team = (id) => ROLES[state.roles.get(id)].team;
    const ranking = [
        ...state.alive.filter((id) => team(id) === winner),
        ...[...state.dead].reverse().filter((id) => team(id) === winner),
    ];
    await finishGroupGame(client, channel, {
        game: 'mafia',
        title: TITLE,
        ranking,
        playerIds: ids,
        summary: `${winner === 'town' ? '🏆 **المواطنين كسبوا!** المافيا اتكشفت كلها.' : '🔪 **المافيا كسبت!** سيطروا على السيرفر.'}\n\n${reveal}`,
    });
}

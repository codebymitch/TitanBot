// roundGames.js — chat games anyone in the channel can play without joining: every round shows a
// prompt and the first correct message wins the round. Most rounds won = 1st place.
//   اسئلة (trivia) • خمن (guess the number) • اسرع (type the word) • فكك (split the letters)
//   رتب (unscramble) • حساب (quick math)

import { triviaQuestions } from './data/trivia.js';
import { gameWords, splitLetters, scrambleWord } from './data/words.js';
import { isAnswer, normalizeAnswer, sample, randomInt } from './text.js';
import { gameEmbed, stopOnAbort, wait, finishGroupGame, rewardsLine, sendGameMessage } from './session.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

/** Finishing order: most rounds won first; on a tie whoever reached that score first. */
export function rankScores(scores) {
    return [...scores.entries()]
        .filter(([, score]) => score.points > 0)
        .sort(([, a], [, b]) => b.points - a.points || a.reachedAt - b.reachedAt)
        .map(([userId]) => userId);
}

/** `+ - ×` question with a whole number answer. */
export function makeMathQuestion(random = Math.random) {
    const int = (min, max) => Math.floor(random() * (max - min + 1)) + min;
    const op = ['+', '-', '×'][int(0, 2)];
    if (op === '×') {
        const a = int(2, 15);
        const b = int(2, 12);
        return { text: `${a} × ${b}`, answer: a * b };
    }
    const a = int(10, 99);
    const b = int(10, 99);
    return op === '+' ? { text: `${a} + ${b}`, answer: a + b } : { text: `${Math.max(a, b)} - ${Math.min(a, b)}`, answer: Math.abs(a - b) };
}

/** `خمن` verdict for one message: null when it isn't a number in range. */
export function judgeGuess(content, target, min, max) {
    const text = normalizeAnswer(content);
    if (!/^\d+$/u.test(text)) return null;
    const guess = Number(text);
    if (guess < min || guess > max) return null;
    if (guess === target) return true;
    return guess < target ? 'higher' : 'lower';
}

const HINT_REACTIONS = { higher: '⬆️', lower: '⬇️' };

/** `خمن` and solo `رقم`: the number is picked from min to max and each player has `tries` guesses. */
export const GUESS_NUMBER = { min: 0, max: 200, tries: 7 };

/**
 * Each game: title, how it's played, default/max rounds, seconds per round and makeRounds(count) →
 * rounds of { prompt, reveal, judge(content) } where judge returns true (correct), false (wrong),
 * null (not an attempt) or 'higher' / 'lower' (a hint for خمن). A round with `maxTries` gives each
 * player that many attempts; after that their messages are ignored for the rest of the round.
 */
export const ROUND_GAMES = {
    trivia: {
        title: '❓ أسئلة عامة',
        how: 'أول واحد يكتب الإجابة الصح ياخد الجولة.',
        rounds: 10,
        seconds: 10,
        makeRounds: (count) => sample(triviaQuestions, count).map((question) => ({
            prompt: `**${question.q}**`,
            reveal: question.a[0],
            judge: (content) => isAnswer(content, question.a),
        })),
    },
    guess: {
        title: '🔢 خمن الرقم',
        how: `البوت اختار رقم من ${GUESS_NUMBER.min} لـ ${GUESS_NUMBER.max}، اكتبوا أرقام و البوت هيقولكم ⬆️ أعلى ولا ⬇️ أقل. كل واحد ليه **${GUESS_NUMBER.tries}** محاولات في الجولة، وأول واحد يجيبه ياخدها.`,
        rounds: 3,
        maxRounds: 5,
        seconds: 60,
        makeRounds: (count) => Array.from({ length: count }, () => {
            const { min, max, tries } = GUESS_NUMBER;
            const target = randomInt(min, max);
            return {
                prompt: `خمنوا الرقم من **${min}** لـ **${max}**! كل واحد ليه **${tries}** محاولات.`,
                reveal: String(target),
                maxTries: tries,
                judge: (content) => judgeGuess(content, target, min, max),
            };
        }),
    },
    fast: {
        title: '⚡ أسرع واحد',
        how: 'أول واحد يكتب الكلمة زي ما هي ياخد الجولة.',
        rounds: 10,
        seconds: 15,
        makeRounds: (count) => sample(gameWords, count).map((word) => ({
            prompt: `اكتب الكلمة دي بسرعة:\n# ${word}`,
            reveal: word,
            judge: (content) => isAnswer(content, [word]),
        })),
    },
    fakkek: {
        title: '✂️ فكك',
        how: 'فككوا الكلمة لحروف بينها مسافات، مثال: سيارة ← س ي ا ر ة',
        rounds: 10,
        seconds: 20,
        makeRounds: (count) => sample(gameWords, count).map((word) => ({
            prompt: `فكك الكلمة دي:\n# ${word}`,
            reveal: splitLetters(word),
            judge: (content) => isAnswer(content, [splitLetters(word)]),
        })),
    },
    scramble: {
        title: '🔀 رتب الحروف',
        how: 'رتبوا الحروف وطلعوا الكلمة الصح.',
        rounds: 10,
        seconds: 30,
        makeRounds: (count) => sample(gameWords, count).map((word) => ({
            prompt: `رتب الحروف دي:\n# ${scrambleWord(word)}`,
            reveal: word,
            judge: (content) => isAnswer(content, [word]),
        })),
    },
    math: {
        title: '🧮 حساب سريع',
        how: 'أول واحد يكتب الناتج الصح ياخد الجولة.',
        rounds: 10,
        seconds: 20,
        makeRounds: (count) => Array.from({ length: count }, () => {
            const question = makeMathQuestion();
            return {
                prompt: `كام ناتج:\n# ${question.text}`,
                reveal: String(question.answer),
                judge: (content) => isAnswer(content, [String(question.answer)]),
            };
        }),
    },
};

export const ROUND_LIMITS = { min: 3, max: 15 };

async function playRound(channel, session, round, { participants, seconds }) {
    return new Promise((resolve) => {
        const collector = channel.createMessageCollector({ filter: (message) => !message.author.bot, time: seconds * 1000 });
        const triesUsed = new Map();
        stopOnAbort(collector, session.signal);
        collector.on('collect', (message) => {
            const userId = message.author.id;
            if (round.maxTries && (triesUsed.get(userId) || 0) >= round.maxTries) return;
            const verdict = round.judge(message.content);
            if (verdict === null) return;
            participants.add(userId);
            triesUsed.set(userId, (triesUsed.get(userId) || 0) + 1);
            if (verdict === true) {
                message.react('✅').catch(() => {});
                collector.stop('answered');
                resolve(message.author);
                return;
            }
            if (HINT_REACTIONS[verdict]) message.react(HINT_REACTIONS[verdict]).catch(() => {});
            // Out of tries for this round.
            if (round.maxTries && triesUsed.get(userId) >= round.maxTries) message.react('🚫').catch(() => {});
        });
        collector.on('end', (_collected, reason) => {
            if (reason !== 'answered') resolve(null);
        });
    });
}

export async function runRoundGame(interaction, client, session, gameKey, requestedRounds) {
    const game = ROUND_GAMES[gameKey];
    const maxRounds = game.maxRounds || ROUND_LIMITS.max;
    const roundCount = Math.min(Math.max(requestedRounds || game.rounds, gameKey === 'guess' ? 1 : ROUND_LIMITS.min), maxRounds);
    const rounds = game.makeRounds(roundCount);
    const channel = interaction.channel;
    const participants = new Set();
    const scores = new Map();
    session.chatOpen = true;

    await InteractionHelper.safeReply(interaction, {
        embeds: [gameEmbed(game.title, [
            `🎮 ${interaction.user} بدأ اللعبة — **السيرفر كله يقدر يشارك**، مش محتاج تدخل.`,
            '',
            `📜 ${game.how}`,
            `🔁 الجولات: **${rounds.length}** • ⏱️ **${game.seconds}** ثانية لكل جولة`,
            `🌀 أعلى 3 بياخدوا CC، وكل ما اللاعبين يزيدوا الجايزة تكبر (10 لاعبين: ${rewardsLine(10)}).`,
            '',
            'أول جولة بعد 5 ثواني...',
        ].join('\n'))],
        allowedMentions: { parse: [] },
    });
    session.track(await interaction.fetchReply().catch(() => null));
    await wait(5000, session.signal);

    for (let index = 0; index < rounds.length && !session.signal.aborted; index += 1) {
        const round = rounds[index];
        await sendGameMessage(session, channel, { embeds: [gameEmbed(`${game.title} — الجولة ${index + 1}/${rounds.length}`, `${round.prompt}\n\n⏱️ عندكم ${game.seconds} ثانية.`)] });
        const winner = await playRound(channel, session, round, { participants, seconds: game.seconds });
        if (session.signal.aborted) break;
        if (winner) {
            const score = scores.get(winner.id) || { points: 0, reachedAt: 0 };
            score.points += 1;
            score.reachedAt = Date.now();
            scores.set(winner.id, score);
            await sendGameMessage(session, channel, { content: `✅ ${winner} جاوب صح! الإجابة: **${round.reveal}** (نقاطه: ${score.points})`, allowedMentions: { parse: [] } });
        } else {
            await sendGameMessage(session, channel, `⏱️ الوقت خلص ومحدش جاوب. الإجابة كانت: **${round.reveal}**`);
        }
        if (index < rounds.length - 1) await wait(3000, session.signal);
    }

    // Stopped with `وقف`: withChannelGame deletes the game's messages.
    if (session.signal.aborted) return;

    const ranking = rankScores(scores);
    const table = ranking.slice(0, 10).map((userId, index) => `**${index + 1}.** <@${userId}> — ${scores.get(userId).points} نقطة`).join('\n');
    await finishGroupGame(client, channel, {
        game: gameKey,
        title: game.title,
        ranking,
        playerIds: [...participants],
        summary: table || 'محدش جاوب ولا جولة 😅',
    });
}

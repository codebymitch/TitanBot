// solo.js — one-player games. A win pays CC.solo.win (5 CC) until the member hits the daily solo cap (only during the CC event).
// rps (حجر) and xo (اكس) use soloRewardText() too.

import { triviaQuestions } from './data/trivia.js';
import { isAnswer, pick, randomInt } from './text.js';
import { judgeGuess, GUESS_NUMBER } from './roundGames.js';
import { MessageFlags } from 'discord.js';
import { gameEmbed, getActiveGame } from './session.js';
import { awardSoloWin } from '../cc/ccService.js';
import { CC, formatCC, soloDailyCap } from '../../config/cc.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

/** Pays a solo win and returns the line to show under the result. */
export async function soloRewardText(client, guildId, userId, game) {
    const { amount, failed } = await awardSoloWin(client, guildId, userId, game);
    if (failed) return '⚠️ ماقدرتش أضيف الـ CC، جرب تاني بعدين.';
    if (amount > 0) return `🌀 +${formatCC(amount)}`;
    return `🌀 وصلت للحد اليومي للألعاب الفردية (${soloDailyCap().toLocaleString('en-US')} ${CC.short}). الألعاب الجماعية لسه بتدي CC!`;
}

export const SLOT_SYMBOLS = ['🍒', '🍋', '🍇', '💎', '🌀'];

export function spinSlots(random = Math.random) {
    return Array.from({ length: 3 }, () => SLOT_SYMBOLS[Math.floor(random() * SLOT_SYMBOLS.length)]);
}

export function isSlotsWin(reels) {
    return reels.every((symbol) => symbol === reels[0]);
}

function awaitPlayerMessages(interaction, seconds, onMessage) {
    return new Promise((resolve) => {
        const collector = interaction.channel.createMessageCollector({
            filter: (message) => message.author.id === interaction.user.id,
            time: seconds * 1000,
        });
        collector.on('collect', (message) => {
            const done = onMessage(message);
            if (done) collector.stop('done');
        });
        collector.on('end', (_collected, reason) => resolve(reason === 'done'));
    });
}

export async function playSoloQuestion(interaction, client) {
    const question = pick(triviaQuestions);
    const seconds = 10;
    await InteractionHelper.safeReply(interaction, {
        embeds: [gameEmbed('❓ سؤال', `${interaction.user}\n**${question.q}**\n\n⏱️ عندك ${seconds} ثانية ومحاولة واحدة.`)],
        allowedMentions: { parse: [] },
    });
    let correct = false;
    await awaitPlayerMessages(interaction, seconds, (message) => {
        correct = isAnswer(message.content, question.a);
        message.react(correct ? '✅' : '❌').catch(() => {});
        return true;
    });
    const reward = correct ? await soloRewardText(client, interaction.guildId, interaction.user.id, 'question') : '';
    await interaction.channel.send({
        content: correct ? `✅ صح يا ${interaction.user}! ${reward}` : `❌ ${interaction.user} الإجابة كانت: **${question.a[0]}**`,
        allowedMentions: { parse: [] },
    });
}

export async function playSoloNumber(interaction, client) {
    const { min, max, tries: maxTries } = GUESS_NUMBER;
    const target = randomInt(min, max);
    let tries = 0;
    let won = false;
    await InteractionHelper.safeReply(interaction, {
        embeds: [gameEmbed('🔢 خمن الرقم', `${interaction.user} اخترت رقم من **${min}** لـ **${max}**.\nعندك **${maxTries}** محاولات ودقيقة، هقولك ⬆️ أعلى ولا ⬇️ أقل.`)],
        allowedMentions: { parse: [] },
    });
    await awaitPlayerMessages(interaction, 60, (message) => {
        const verdict = judgeGuess(message.content, target, min, max);
        if (verdict === null) return false;
        tries += 1;
        if (verdict === true) {
            won = true;
            message.react('✅').catch(() => {});
            return true;
        }
        message.react(verdict === 'higher' ? '⬆️' : '⬇️').catch(() => {});
        return tries >= maxTries;
    });
    const reward = won ? await soloRewardText(client, interaction.guildId, interaction.user.id, 'number') : '';
    await interaction.channel.send({
        content: won ? `🎉 ${interaction.user} جبته في ${tries} محاولات! ${reward}` : `❌ ${interaction.user} خسرت، الرقم كان **${target}**.`,
        allowedMentions: { parse: [] },
    });
}

export async function playSlots(interaction, client) {
    const reels = spinSlots();
    const won = isSlotsWin(reels);
    const reward = won ? await soloRewardText(client, interaction.guildId, interaction.user.id, 'slots') : '';
    await InteractionHelper.safeReply(interaction, {
        embeds: [gameEmbed('🎰 سلوت', `${interaction.user}\n\n# ${reels.join(' | ')}\n\n${won ? `🎉 **3 زي بعض! كسبت** ${reward}` : '😅 حظ أوفر المرة الجاية.'}`)],
        allowedMentions: { parse: [] },
    });
}

export const SOLO_GAMES = { question: playSoloQuestion, number: playSoloNumber, slots: playSlots };
// Games that read the player's next messages: one at a time per member, and not in a channel with a
// group game. userId → channelId, also read by the games-only channel guard.
const CHAT_GAMES = new Set(['question', 'number']);
const playingIn = new Map();

export function isPlayingSoloIn(channelId, userId) {
    return playingIn.get(userId) === channelId;
}

/** Starts solo game `kind` for the interaction's user (from `/solo` or the games panel). */
export async function startSoloGame(interaction, client, kind) {
    const play = SOLO_GAMES[kind];
    if (!play || !interaction.channel?.isTextBased?.()) return;

    const readsChat = CHAT_GAMES.has(kind);
    if (readsChat) {
        if (getActiveGame(interaction.channel.id)) {
            await InteractionHelper.safeReply(interaction, { content: '⚠️ في لعبة جماعية شغالة في الروم ده، استنى لما تخلص.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (playingIn.has(interaction.user.id)) {
            await InteractionHelper.safeReply(interaction, { content: '⚠️ خلص لعبتك الأول.', flags: MessageFlags.Ephemeral });
            return;
        }
        playingIn.set(interaction.user.id, interaction.channel.id);
    }
    try {
        await play(interaction, client);
    } finally {
        if (readsChat) playingIn.delete(interaction.user.id);
    }
}

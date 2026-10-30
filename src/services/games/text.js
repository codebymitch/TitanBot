// text.js — helpers shared by the games.

const DIACRITICS = /[ً-ٰٟـ]/gu; // tashkeel and tatweel

/** Loose form of an answer: lowercase, no tashkeel, أ/إ/آ → ا, ة → ه, ى → ي, single spaces. */
export function normalizeAnswer(text) {
    return String(text || '')
        .toLowerCase()
        .replace(DIACRITICS, '')
        .replace(/[أإآٱ]/gu, 'ا')
        .replace(/ة/gu, 'ه')
        .replace(/ى/gu, 'ي')
        .replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[.,!?؟،"'`*_~|]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
}

export function isAnswer(text, answers) {
    const guess = normalizeAnswer(text);
    return Boolean(guess) && answers.some((answer) => normalizeAnswer(answer) === guess);
}

export function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

export function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/** `count` different random items from `list`. */
export function sample(list, count) {
    return shuffle(list).slice(0, count);
}

export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export const MEDALS = ['🥇', '🥈', '🥉'];

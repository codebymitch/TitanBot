import { logger } from '../utils/logger.js';

// The waving emoji of the welcome message (reports #175, #177). It comes from another server the bot
// isn't in, so Discord showed it as ":smileywave:" text. The bot now uploads it once as its own
// application emoji (usable in any server, takes no server emoji slot) and uses that one.
export const WELCOME_EMOJI_NAME = 'smileywave';
export const WELCOME_EMOJI_URL = 'https://cdn.discordapp.com/emojis/1537905313628291142.gif';
const FALLBACK = '👋';

let welcomeEmoji = null;

/** The emoji to put in the welcome: the bot's own copy, or 👋 until it is ready. */
export function getWelcomeEmoji(client) {
    if (welcomeEmoji) return welcomeEmoji;
    const cached = client?.application?.emojis?.cache?.find?.((emoji) => emoji.name === WELCOME_EMOJI_NAME);
    return cached ? String(cached) : FALLBACK;
}

/** Makes sure the bot has its own copy of the emoji (uploads it once). Returns the emoji text. */
export async function ensureWelcomeEmoji(client) {
    const manager = client?.application?.emojis;
    if (!manager) return FALLBACK;
    try {
        const emojis = await manager.fetch();
        let emoji = [...emojis.values()].find((item) => item.name === WELCOME_EMOJI_NAME);
        if (!emoji) emoji = await manager.create({ attachment: WELCOME_EMOJI_URL, name: WELCOME_EMOJI_NAME });
        welcomeEmoji = String(emoji);
        return welcomeEmoji;
    } catch (error) {
        logger.warn(`Welcome emoji not ready, using ${FALLBACK}: ${error.message}`);
        return FALLBACK;
    }
}

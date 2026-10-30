import { logger } from '../utils/logger.js';
import { findBoardMessage, rememberBoardMessage } from '../utils/boardMessage.js';
import { SAVED_IDEAS } from '../config/savedIdeas.js';
import { TRUSTED_BOARD_CHANNEL_ID } from './trustedBoardService.js';

// A second post in the trusted channel listing the ideas saved for later (src/config/savedIdeas.js).
// It is edited in place on every startup and posted once if missing; the saved message ID prevents duplicates.
const BOARD_KEY = 'savedIdeas';
export const SAVED_IDEAS_TITLE = '📝 أفكار محفوظة لبعدين';

export function buildSavedIdeasEmbed(ideas = SAVED_IDEAS) {
    return {
        color: 0xfee75c,
        title: SAVED_IDEAS_TITLE,
        description: ideas.length
            ? 'حاجات صاحب السيرفر طلب نحفظها ونعملها بعدين، لسه ما اتعملتش:'
            : 'مفيش أفكار محفوظة دلوقتي.',
        fields: ideas.slice(0, 25).map((idea, index) => ({ name: `${index + 1}. ${idea.title}`.slice(0, 256), value: idea.details.slice(0, 1024) })),
        footer: { text: `${ideas.length} فكرة محفوظة • بتتعمل لما صاحب السيرفر يطلبها` },
    };
}

export const isSavedIdeasBoard = (message) => Boolean(message.embeds[0]?.title?.includes('أفكار محفوظة'));

export async function publishSavedIdeasBoard(client) {
    const channel = await client.channels.fetch(TRUSTED_BOARD_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.() || !channel.guild) return { status: 'missing-channel' };

    const embed = buildSavedIdeasEmbed();
    const isOwn = (message) => message.author?.id === client.user.id && isSavedIdeasBoard(message);
    const existing = await findBoardMessage(channel, BOARD_KEY, isOwn);
    if (existing) {
        await existing.edit({ embeds: [embed], allowedMentions: { parse: [] } });
        return { status: 'updated' };
    }
    const sent = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await rememberBoardMessage(channel, BOARD_KEY, sent.id);
    logger.info(`Posted the saved ideas board in channel ${TRUSTED_BOARD_CHANNEL_ID}`);
    return { status: 'sent' };
}

// challenge.js — games against another member (xo, fight) start with an invite: the challenged member
// gets 20 seconds to press قبول or رفض, and the game only starts once they accept. The challenger can
// take the invite back with رفض too. A refused, cancelled or unanswered invite is shown for a few
// seconds and then deleted together with the command that sent it.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { gameEmbed } from './session.js';

export const INVITE_MS = 20_000;
const CLOSED_INVITE_DELETE_MS = 5_000;

function inviteRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('invite_accept').setLabel('قبول').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('invite_decline').setLabel('رفض').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    );
}

/** What an invite answer means: 'accept', 'decline', 'cancel' (challenger took it back) or null (not theirs). */
export function inviteAnswer(customId, userId, challengerId, opponentId) {
    if (userId === opponentId) return customId === 'invite_accept' ? 'accept' : 'decline';
    if (userId === challengerId && customId === 'invite_decline') return 'cancel';
    return null;
}

/**
 * Posts the invite as the command's reply and waits for the opponent. Resolves to the invite message
 * when accepted (the game then edits it into the board), or null when refused, cancelled or unanswered.
 */
export async function inviteOpponent(interaction, opponent, gameName) {
    const challenger = interaction.user;
    await InteractionHelper.safeReply(interaction, {
        content: `${opponent}`,
        embeds: [gameEmbed(`🎮 دعوة ${gameName}`, `${challenger} بيعزمك تلعب **${gameName}**.\n⏱️ عندك ${INVITE_MS / 1000} ثانية تقبل أو ترفض.`)],
        components: [inviteRow()],
        allowedMentions: { users: [opponent.id] },
    });
    const message = await interaction.fetchReply();

    const answer = await new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: INVITE_MS });
        collector.on('collect', async (button) => {
            const result = inviteAnswer(button.customId, button.user.id, challenger.id, opponent.id);
            if (!result) {
                await button.reply({ content: challenger.id === button.user.id ? 'استنى لما يرد.' : 'الدعوة دي مش ليك.', flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            await button.deferUpdate().catch(() => {});
            collector.stop(result);
        });
        collector.on('end', (_collected, reason) => resolve(['accept', 'decline', 'cancel'].includes(reason) ? reason : 'timeout'));
    });

    if (answer === 'accept') return message;

    const text = {
        decline: `✖️ ${opponent} رفض الدعوة.`,
        cancel: `✖️ ${challenger} لغى الدعوة.`,
        timeout: `⌛ ${opponent} مارد على الدعوة.`,
    }[answer];
    await message.edit({ content: text, embeds: [], components: [], allowedMentions: { parse: [] } }).catch(() => {});
    setTimeout(() => {
        message.delete().catch(() => {});
        if (interaction._sourceMessage && interaction._sourceMessage.id !== message.id) interaction._sourceMessage.delete().catch(() => {});
    }, CLOSED_INVITE_DELETE_MS);
    return null;
}

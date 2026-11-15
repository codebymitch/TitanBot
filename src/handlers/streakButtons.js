import { logger } from '../utils/logger.js';
import { successEmbed, warningEmbed } from '../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import StreakService from '../services/streakService.js';

function resolveActor(interaction, args) {
    const [fromId, toId] = args || [];

    if (!fromId || !toId) {
        return null;
    }

    if (interaction.user.id !== toId) {
        return { fromId, toId, allowed: false };
    }

    return { fromId, toId, allowed: true };
}

async function editRequestMessage(interaction, embed) {
    try {
        await interaction.message.edit({ embeds: [embed], components: [] });
        return true;
    } catch (error) {
        logger.warn('Failed to edit streak request message:', error.message);
        return false;
    }
}

export const streakAcceptHandler = {
    customId: 'streak_accept',
    async execute(interaction, client, args) {
        const actor = resolveActor(interaction, args);
        if (!actor) {
            return replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'This streak request is no longer valid.' });
        }
        if (!actor.allowed) {
            return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'This streak request is not for you.' });
        }

        await StreakService.acceptStreakRequest(client, interaction.guildId, actor.fromId, actor.toId);

        await editRequestMessage(interaction, successEmbed(
            'Streak Accepted',
            `<@${actor.fromId}> and <@${actor.toId}> are now on a streak. Reply to each other or use \`/streak send\` every day to keep it going.`
        ));
    }
};

export const streakDeclineHandler = {
    customId: 'streak_decline',
    async execute(interaction, client, args) {
        const actor = resolveActor(interaction, args);
        if (!actor) {
            return replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'This streak request is no longer valid.' });
        }
        if (!actor.allowed) {
            return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'This streak request is not for you.' });
        }

        await StreakService.declineStreakRequest(client, interaction.guildId, actor.fromId, actor.toId);

        await editRequestMessage(interaction, warningEmbed(
            'Streak Declined',
            `<@${actor.toId}> declined the streak request from <@${actor.fromId}>.`
        ));
    }
};

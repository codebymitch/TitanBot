import { createEmbed, infoEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import StreakService from '../../../services/streakService.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const target = interaction.options.getUser('user');
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        if (target.id === userId) {
            return await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Pick another member to view a streak with.'
            });
        }

        if (target.bot) {
            return await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Bots cannot keep streaks.'
            });
        }

        const streak = await StreakService.getStreak(client, guildId, userId, target.id);

        if (!streak || !streak.accepted) {
            const incoming = await StreakService.getStreakRequest(client, guildId, target.id, userId);
            const outgoing = incoming ? null : await StreakService.getStreakRequest(client, guildId, userId, target.id);

            let body;
            if (incoming) {
                body = `${target} sent you a streak request. Accept it with the buttons on the request message.`;
            } else if (outgoing) {
                body = `You have a pending streak request to ${target}. Waiting for them to accept.`;
            } else {
                body = `You and ${target} do not have a streak yet. Start one with \`/streak request\`.`;
            }

            const embed = infoEmbed('No Streak Yet', body);
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const current = streak.currentCount;
        const best = streak.best;

        const embed = createEmbed({
            title: 'Streak',
            description: `${interaction.user} & ${target}`,
            color: streak.active ? 'success' : 'warning',
            fields: [
                { name: 'Current', value: `${current} day${current === 1 ? '' : 's'}`, inline: true },
                { name: 'Best', value: `${best} day${best === 1 ? '' : 's'}`, inline: true },
                { name: 'Status', value: streak.active ? 'Active' : 'Broken', inline: true }
            ]
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};

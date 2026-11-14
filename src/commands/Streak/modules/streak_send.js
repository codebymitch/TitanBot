import { createEmbed } from '../../../utils/embeds.js';
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
                message: 'You cannot start a streak with yourself.'
            });
        }

        if (target.bot) {
            return await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Bots cannot keep streaks.'
            });
        }

        const result = await StreakService.recordInteraction(client, guildId, userId, target.id);

        if (!result.recorded) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `You don't have an accepted streak with ${target}. Send a request first with \`/streak request\`.`
            });
        }

        const { streak, incremented } = result;
        const today = StreakService.toDayKey(Date.now());
        const countedToday = streak.lastBothDay === today;

        let description;
        if (countedToday) {
            description = `You and ${target} are now on a **${streak.currentCount} day** streak.`;
        } else {
            description = `Streak sent to ${target}. They need to send one back today to keep it going.`;
        }

        const embed = createEmbed({
            title: incremented ? 'Streak Advanced' : 'Streak Sent',
            description,
            color: countedToday ? 'success' : 'info',
            fields: [
                { name: 'Current', value: `${streak.currentCount} day${streak.currentCount === 1 ? '' : 's'}`, inline: true },
                { name: 'Best', value: `${streak.best} day${streak.best === 1 ? '' : 's'}`, inline: true }
            ]
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};

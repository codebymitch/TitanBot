import { createEmbed, infoEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import StreakService from '../../../services/streakService.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const guildId = interaction.guildId;
        const entries = await StreakService.getGuildLeaderboard(client, guildId, { limit: 10 });

        if (entries.length === 0) {
            const embed = infoEmbed('No Active Streaks Yet', 'This server doesn\'t have any active streaks yet.');
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const lines = entries.map((streak, index) => {
            return `**${index + 1}.** <@${streak.userId}> — **${streak.currentCount} days** (best: ${streak.best})`;
        });

        const embed = createEmbed({
            title: 'Streak Leaderboard',
            description: lines.join('\n'),
            color: 'primary'
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};

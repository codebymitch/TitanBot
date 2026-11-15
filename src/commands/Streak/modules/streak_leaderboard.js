import { createEmbed, infoEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import StreakService from '../../../services/streakService.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const guildId = interaction.guildId;
        const entries = await StreakService.getGuildLeaderboard(client, guildId, { limit: 10 });

        if (entries.length === 0) {
            const embed = infoEmbed('No Active Streaks', 'This server has no active streaks yet.');
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const lines = entries.map((streak, index) => {
            const [first, second] = streak.users;
            return `**${index + 1}.** <@${first}> & <@${second}> — **${streak.currentCount} day${streak.currentCount === 1 ? '' : 's'}**`;
        });

        const embed = createEmbed({
            title: 'Streak Leaderboard',
            description: lines.join('\n'),
            color: 'primary'
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }
};

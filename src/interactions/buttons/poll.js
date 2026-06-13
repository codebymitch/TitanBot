import { EmbedBuilder } from 'discord.js';

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export default {
    name: 'poll_end',
    async execute(interaction, client, args) {
        const creatorId = args[0];

        if (interaction.user.id !== creatorId) {
            return interaction.reply({ content: '❌ Only the poll creator can end this poll.', ephemeral: true });
        }

        await interaction.deferUpdate();

        const message = interaction.message;
        const pollData = await client.db.get(`poll:${message.id}`).catch(() => null);

        // Fetch fresh reaction counts
        const freshMsg = await message.fetch().catch(() => message);

        const results = [];
        let totalVotes = 0;

        if (pollData?.options) {
            for (let i = 0; i < pollData.options.length; i++) {
                const emoji = EMOJIS[i];
                const reaction = freshMsg.reactions.cache.get(emoji);
                // subtract 1 for the bot's own reaction
                const count = Math.max(0, (reaction?.count ?? 1) - 1);
                results.push({ option: pollData.options[i], count, emoji });
                totalVotes += count;
            }
        } else {
            // Fallback: parse reactions from the message
            for (const [emoji, reaction] of freshMsg.reactions.cache) {
                if (EMOJIS.includes(emoji)) {
                    const count = Math.max(0, reaction.count - 1);
                    results.push({ option: emoji, count, emoji });
                    totalVotes += count;
                }
            }
        }

        results.sort((a, b) => b.count - a.count);

        const winner = results[0];
        const bars = results.map(r => {
            const pct = totalVotes > 0 ? r.count / totalVotes : 0;
            const filled = Math.round(pct * 10);
            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
            const pctStr = (pct * 100).toFixed(1);
            return `${r.emoji} **${r.option}**\n\`${bar}\` ${r.count} vote${r.count !== 1 ? 's' : ''} (${pctStr}%)`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 Poll Results${pollData?.question ? `: ${pollData.question}` : ''}`)
            .setDescription(bars.join('\n\n'))
            .addFields({ name: 'Total Votes', value: `${totalVotes}`, inline: true })
            .setFooter({ text: winner && totalVotes > 0 ? `🏆 Winner: ${winner.option}` : 'No votes cast' })
            .setTimestamp();

        await message.edit({ embeds: [embed], components: [] });
        await client.db.del(`poll:${message.id}`).catch(() => {});
    },
};

import { EmbedBuilder } from 'discord.js';

export default [
    {
        name: 'leave-confirm',
        async execute(interaction, client, args) {
            const reqId = args[0];
            const req = client.leaveRequests?.get(reqId);
            if (!req) return interaction.update({ content: '❌ This request has expired.', embeds: [], components: [] });

            client.leaveRequests.delete(reqId);

            const guild = client.guilds.cache.get(req.guildId);
            const guildName = guild?.name ?? req.guildName;

            await interaction.update({
                embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Confirmed — leaving **${guildName}**.`)],
                components: [],
            });

            if (guild) await guild.leave().catch(() => {});

            // Notify requester
            try {
                const channel = await client.channels.fetch(req.channelId).catch(() => null);
                if (channel) await channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Leave request approved — bot has left **${guildName}**.`)] });
            } catch {}
        },
    },
    {
        name: 'leave-decline',
        async execute(interaction, client, args) {
            const reqId = args[0];
            const req = client.leaveRequests?.get(reqId);
            if (!req) return interaction.update({ content: '❌ This request has expired.', embeds: [], components: [] });

            client.leaveRequests.delete(reqId);

            await interaction.update({
                embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Declined — the bot will stay in **${req.guildName}**.`)],
                components: [],
            });

            // Notify requester
            try {
                const channel = await client.channels.fetch(req.channelId).catch(() => null);
                if (channel) await channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Leave request declined — bot stays in **${req.guildName}**.`)] });
            } catch {}
        },
    },
];

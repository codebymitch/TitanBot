import { Events, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
    name: Events.MessageReactionRemove,
    async execute(reaction, user, client) {
        try {
            if (user.bot) return;
            if (reaction.partial) await reaction.fetch().catch(() => null);
            if (reaction.message.partial) await reaction.message.fetch().catch(() => null);
            if (reaction.emoji.name !== '⭐') return;

            const msg = reaction.message;
            if (!msg.guild) return;

            const config = await client.db.get(`starboard:config:${msg.guild.id}`).catch(() => null);
            if (!config) return;

            const entryKey = `starboard:msg:${msg.guild.id}:${msg.id}`;
            const existingId = await client.db.get(entryKey).catch(() => null);
            if (!existingId) return;

            const sbChannel = msg.guild.channels.cache.get(config.channelId);
            if (!sbChannel) return;

            const sbMsg = await sbChannel.messages.fetch(existingId).catch(() => null);
            if (!sbMsg) return;

            const starCount = reaction.count ?? 0;

            if (starCount < config.threshold) {
                await sbMsg.delete().catch(() => {});
                await client.db.del(entryKey).catch(() => {});
            } else {
                const emoji = starCount >= 10 ? '🌟' : '⭐';
                const header = `${emoji} **${starCount}** | <#${msg.channel.id}>`;
                const embed = new EmbedBuilder()
                    .setColor(0xFFAC33)
                    .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
                    .setTimestamp(msg.createdAt)
                    .addFields({ name: 'Jump', value: `[View message](${msg.url})`, inline: true });
                if (msg.content) embed.setDescription(msg.content.slice(0, 4000));
                const image = msg.attachments.find(a => a.contentType?.startsWith('image/'));
                if (image) embed.setImage(image.url);
                await sbMsg.edit({ content: header, embeds: [embed] }).catch(() => {});
            }
        } catch (err) {
            logger.error('Starboard reactionRemove error:', err?.message);
        }
    },
};

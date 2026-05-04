import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CATEGORIES = {
    anime:      { label: 'Anime',      subreddit: 'animeedits',   emoji: '🎌' },
    cars:       { label: 'Cars',       subreddit: 'CarVideos',    emoji: '🚗' },
    nature:     { label: 'Nature',     subreddit: 'NatureGifs',   emoji: '🌍' },
    gaming:     { label: 'Gaming',     subreddit: 'GamePhysics',  emoji: '🎮' },
    sports:     { label: 'Sports',     subreddit: 'sports',       emoji: '⚽' },
    space:      { label: 'Space',      subreddit: 'Spacegifs',    emoji: '🚀' },
    satisfying: { label: 'Satisfying', subreddit: 'perfectloops', emoji: '✨' },
    funny:      { label: 'Funny',      subreddit: 'funny',        emoji: '😂' },
};

export default {
    data: new SlashCommandBuilder()
        .setName('edit')
        .setDescription('Get a random video edit from a category')
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('The category of edit to fetch')
                .setRequired(true)
                .addChoices(
                    ...Object.entries(CATEGORIES).map(([value, { label, emoji }]) => ({
                        name: `${emoji} ${label}`,
                        value,
                    }))
                )
        ),

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const key = interaction.options.getString('category');
            const { label, subreddit, emoji } = CATEGORIES[key];

            const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=50`, {
                headers: { 'User-Agent': 'ZenBot/1.0' },
            });

            if (!res.ok) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Failed', `Could not fetch a ${label} edit right now. Try again later.`)],
                });
            }

            const json = await res.json();
            const posts = json.data.children
                .map(p => p.data)
                .filter(p => p.is_video && !p.over_18);

            if (posts.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('No Videos Found', `No video edits found in ${emoji} ${label} right now. Try again later.`)],
                });
            }

            const post = posts[Math.floor(Math.random() * posts.length)];

            const embed = createEmbed({
                title: `${emoji} ${post.title}`,
                color: 'blurple',
                footer: { text: `r/${post.subreddit} • 👍 ${post.ups.toLocaleString()}` },
                timestamp: false,
            });
            embed.setURL(`https://reddit.com${post.permalink}`);

            await InteractionHelper.safeEditReply(interaction, {
                content: `https://reddit.com${post.permalink}`,
                embeds: [embed],
            });

            logger.info(`Edit: ${interaction.user.id} got ${label} video from r/${post.subreddit}`);
        } catch (error) {
            logger.error('Edit command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'edit' });
        }
    },
};

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CATEGORIES = {
    anime:   { label: 'Anime',   subreddit: 'animeedits',    emoji: '🎌' },
    cars:    { label: 'Cars',    subreddit: 'carporn',       emoji: '🚗' },
    nature:  { label: 'Nature',  subreddit: 'EarthPorn',     emoji: '🌍' },
    cities:  { label: 'Cities',  subreddit: 'CityPorn',      emoji: '🌆' },
    animals: { label: 'Animals', subreddit: 'NatureIsFucked', emoji: '🐾' },
    gaming:  { label: 'Gaming',  subreddit: 'gaming',        emoji: '🎮' },
    sports:  { label: 'Sports',  subreddit: 'sports',        emoji: '⚽' },
    space:   { label: 'Space',   subreddit: 'spaceporn',     emoji: '🚀' },
};

export default {
    data: new SlashCommandBuilder()
        .setName('edit')
        .setDescription('Get a random edit from a category')
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

            const res = await fetch(`https://meme-api.com/gimme/${subreddit}`);

            if (!res.ok) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Failed', `Could not fetch a ${label} edit right now. Try again later.`)],
                });
            }

            const data = await res.json();

            if (data.nsfw) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('NSFW', 'The fetched post was NSFW. Try again!')],
                });
            }

            const embed = createEmbed({
                title: `${emoji} ${data.title}`,
                color: 'blurple',
                footer: { text: `r/${data.subreddit} • 👍 ${data.ups}` },
                timestamp: false,
            });
            embed.setImage(data.url);
            embed.setURL(data.postLink);

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.info(`Edit: ${interaction.user.id} got ${label} edit from r/${data.subreddit}`);
        } catch (error) {
            logger.error('Edit command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'edit' });
        }
    },
};

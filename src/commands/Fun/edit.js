import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const TEMPLATES = [
    'https://www.capcut.com/template-detail/7581489168228830469',
    'https://www.capcut.com/tv2/ZSHKMDrGU/',
];

export default {
    data: new SlashCommandBuilder()
        .setName('edit')
        .setDescription('Get a random CapCut edit template'),

    async execute(interaction) {
        try {
            const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];

            const embed = createEmbed({
                title: '🎬 Random Edit Template',
                description: `Here's a CapCut template for you!\n\n🔗 [Open Template](${template})`,
                color: 'blurple',
                footer: { text: 'Click the link to open in CapCut' },
            });

            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
            logger.info(`Edit: ${interaction.user.id} got template ${template}`);
        } catch (error) {
            logger.error('Edit command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'edit' });
        }
    },
};

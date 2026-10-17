import type { SubcommandModule } from '../../../types/index.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction) {
        const query = interaction.options.getString('query')!;
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        const embed = createEmbed({
            title: 'Google-Suche',
            description: `[Nach „${query}“ suchen](${searchUrl})`,
            color: 'info'
        })
        .setFooter({ text: 'Google-Suchergebnisse' });

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });

        logger.info('Google search link generated', {
            userId: interaction.user.id,
            query: query,
            guildId: interaction.guildId,
            commandName: 'google'
        });
    },
} satisfies SubcommandModule;

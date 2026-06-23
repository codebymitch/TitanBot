import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { linkOsrsUsername } from '../../utils/database/osrs.js';

export default {
    data: new SlashCommandBuilder()
        .setName('link-osrs')
        .setDescription('Link your Old School RuneScape username to your Discord account')
        .addStringOption((option) =>
            option
                .setName('username')
                .setDescription('Your OSRS in-game username')
                .setRequired(true),
        ),

    execute: withErrorHandling(async (interaction, _config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const username = interaction.options.getString('username', true);

        try {
            const link = await linkOsrsUsername(client, interaction.guildId, interaction.user.id, username);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: 'OSRS Username Linked',
                        description: `Your OSRS username is now linked as **${link.osrsUsername}**.`,
                        color: 'success',
                    }),
                ],
            });
        } catch (error) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(error.message)] });
        }
    }, { command: 'link-osrs' }),
};

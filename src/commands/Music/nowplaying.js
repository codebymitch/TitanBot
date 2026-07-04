import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { buildNowPlayingReply } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing track'),

    async execute(interaction, config, client) {
        try {
            await deferMusicCommand(interaction);
            const payload = buildNowPlayingReply(client, interaction.guild.id);
            await InteractionHelper.safeEditReply(interaction, payload);
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'nowplaying' });
        }
    },
};

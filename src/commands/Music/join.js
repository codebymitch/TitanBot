import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { joinVoiceChannel, replyMusicSuccess } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your voice channel without starting playback'),

    async execute(interaction, config, client) {
        try {
            await deferMusicCommand(interaction);
            const embed = await joinVoiceChannel(client, interaction);
            await replyMusicSuccess(interaction, embed);
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'join' });
        }
    },
};

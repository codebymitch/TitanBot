import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { joinVoiceChannel, replyMusicSuccess } from '../../../services/music/musicActions.js';
import { deferMusicCommand } from '../../../services/music/prefixSupport.js';
import type { Command } from '../../../types/index.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Deinem Sprachkanal beitreten, ohne die Wiedergabe zu starten'),

    async execute(interaction, config, client) {
        const deferred = await deferMusicCommand(interaction);
        if (!deferred) {
            return;
        }

        const embed = await joinVoiceChannel(client, interaction);
        await replyMusicSuccess(interaction, embed);
    },
} satisfies Command;

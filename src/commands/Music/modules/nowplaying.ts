import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { buildNowPlayingReply } from '../../../services/music/musicActions.js';
import { deferMusicCommand } from '../../../services/music/prefixSupport.js';
import type { Command } from '../../../types/index.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Aktuell laufenden Titel anzeigen'),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const payload = buildNowPlayingReply(client, interaction.guild!.id);
        await InteractionHelper.safeEditReply(interaction, payload);
    },
} satisfies Command;

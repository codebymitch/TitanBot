import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export function getMusicDeferOptions(interaction) {
    return interaction._isPrefixCommand ? {} : { flags: MessageFlags.Ephemeral };
}

export async function deferMusicCommand(interaction) {
    return InteractionHelper.safeDefer(interaction, getMusicDeferOptions(interaction));
}

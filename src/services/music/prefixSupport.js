import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export function getMusicDeferOptions(interaction) {
    if (interaction?._isPrefixCommand) {
        return {};
    }

    return {
        flags: MessageFlags.Ephemeral,
    };
}

export async function deferMusicCommand(interaction) {
    if (!interaction || typeof InteractionHelper?.safeDefer !== 'function') {
        return false;
    }

    return InteractionHelper.safeDefer(interaction, getMusicDeferOptions(interaction));
}

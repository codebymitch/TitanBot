import { MessageFlags } from 'discord.js';
import type { InteractionDeferReplyOptions } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import type { NexoInteraction } from '../../utils/interactionHelper.js';

export function getMusicDeferOptions(interaction: NexoInteraction): InteractionDeferReplyOptions {
    return interaction._isPrefixCommand ? {} : { flags: MessageFlags.Ephemeral };
}

export async function deferMusicCommand(interaction: NexoInteraction): Promise<boolean> {
    return InteractionHelper.safeDefer(interaction, getMusicDeferOptions(interaction));
}

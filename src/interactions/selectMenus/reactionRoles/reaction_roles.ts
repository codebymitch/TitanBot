import type { StringSelectMenuInteraction } from 'discord.js';
import { handleReactionRolesSelectMenu } from '../../../handlers/interactionHandlers/reactionRolesSelectMenu.js';
import type { NexoClient, SelectMenuHandler } from '../../../types/index.js';

export async function execute(interaction: StringSelectMenuInteraction, client: NexoClient): Promise<unknown> {
    return handleReactionRolesSelectMenu(interaction, client);
}

export default {
    name: 'reaction_roles',
    execute
} satisfies SelectMenuHandler;
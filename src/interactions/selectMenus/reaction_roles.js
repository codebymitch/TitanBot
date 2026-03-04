import { handleReactionRolesSelectMenu } from '../../handlers/interactionHandlers/reactionRolesSelectMenu.js';

export async function execute(interaction, client) {
    return handleReactionRolesSelectMenu(interaction, client);
}

export default {
    name: 'reaction_roles',
    execute
};




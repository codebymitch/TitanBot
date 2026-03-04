import { handleGoodbyeConfigButton } from '../../handlers/interactionHandlers/goodbyeConfigButton.js';

export default {
    name: 'goodbye_config',
    async execute(interaction, client, args) {
        return handleGoodbyeConfigButton(interaction, client, args);
    }
};
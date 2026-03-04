import { handleWelcomeConfigButton } from '../../handlers/interactionHandlers/welcomeConfigButton.js';

export default {
    name: 'welcome_config',
    async execute(interaction, client, args) {
        return handleWelcomeConfigButton(interaction, client, args);
    }
};
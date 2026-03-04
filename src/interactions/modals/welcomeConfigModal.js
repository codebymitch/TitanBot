import { handleWelcomeConfigModal } from '../../handlers/interactionHandlers/welcomeConfigModal.js';

export default {
    name: 'welcome_config_modal',
    async execute(interaction, client, args) {
        return handleWelcomeConfigModal(interaction, client, args);
    }
};
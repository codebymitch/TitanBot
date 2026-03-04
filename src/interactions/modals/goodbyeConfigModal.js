import { handleGoodbyeConfigModal } from '../../handlers/interactionHandlers/goodbyeConfigModal.js';

export default {
    name: 'goodbye_config_modal',
    async execute(interaction, client, args) {
        return handleGoodbyeConfigModal(interaction, client, args);
    }
};
import { logger } from '../utils/logger.js';
import { handleMusicVoiceState } from '../services/music/musicVoiceState.js';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        if (newState.member?.user?.bot) return;

        if (client.config?.features?.music) {
            await handleMusicVoiceState(client, oldState, newState).catch((error) => {
                logger.error('Music voice state handler error:', error);
            });
        }
    }
};

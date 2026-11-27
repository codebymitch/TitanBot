import { logger } from '../../utils/logger.js';
import { setupPlayerHandler } from './playerHandler.js';

export function initializeMusic(client) {
    if (!client) {
        return;
    }

    if (!client.music) {
        client.music = {
            directMode: true,
            _gatewayBound: false,
            _initializedUserId: null,
        };
    }

    if (client.music._gatewayBound) {
        setupPlayerHandler(client);
        return;
    }

    client.music._gatewayBound = true;
    setupPlayerHandler(client);

    logger.info('Music initialized in direct mode (no Lavalink/Riffy required).');
}

export function initRiffyAfterReady(client) {
    const botId = client?.user?.id;
    if (!client?.music || !botId) {
        return;
    }

    if (client.music._initializedUserId === botId) {
        return;
    }

    client.music._initializedUserId = botId;
    logger.info('Direct voice music manager initialized.');
}

export default initializeMusic;

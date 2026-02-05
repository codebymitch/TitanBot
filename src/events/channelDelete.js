import { 
    getJoinToCreateConfig, 
    removeJoinToCreateTrigger,
    unregisterTemporaryChannel
} from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
    name: 'channelDelete',
    async execute(channel, client) {
        // Only handle voice channels and categories
        if (channel.type !== 2 && channel.type !== 4) { // GuildVoice = 2, GuildCategory = 4
            return;
        }

        const guildId = channel.guild.id;

        try {
            // Get Join to Create configuration for this guild
            const config = await getJoinToCreateConfig(client, guildId);

            // If Join to Create is not enabled, do nothing
            if (!config.enabled) {
                return;
            }

            // Handle deletion of a trigger channel
            if (config.triggerChannels.includes(channel.id)) {
                logger.info(`Join to Create trigger channel ${channel.name} (${channel.id}) was deleted, removing from configuration`);
                
                const success = await removeJoinToCreateTrigger(client, guildId, channel.id);
                if (success) {
                    logger.info(`Successfully removed trigger channel ${channel.id} from Join to Create configuration`);
                } else {
                    logger.warn(`Failed to remove trigger channel ${channel.id} from Join to Create configuration`);
                }
            }

            // Handle deletion of a temporary channel
            if (config.temporaryChannels[channel.id]) {
                logger.info(`Join to Create temporary channel ${channel.name} (${channel.id}) was deleted, cleaning up database`);
                
                const success = await unregisterTemporaryChannel(client, guildId, channel.id);
                if (success) {
                    logger.info(`Successfully cleaned up temporary channel ${channel.id} from database`);
                } else {
                    logger.warn(`Failed to cleanup temporary channel ${channel.id} from database`);
                }
            }

            // Handle deletion of the category used for temporary channels
            if (config.categoryId === channel.id) {
                logger.warn(`Category ${channel.name} (${channel.id}) used for Join to Create temporary channels was deleted. Join to Create will be disabled.`);
                
                // Update config to disable Join to Create since the category is gone
                config.categoryId = null;
                config.enabled = false;
                
                try {
                    await client.db.set(`guild:${guildId}:jointocreate`, config);
                    logger.info(`Disabled Join to Create for guild ${guildId} due to category deletion`);
                } catch (error) {
                    logger.error(`Failed to disable Join to Create for guild ${guildId}:`, error);
                }
            }

        } catch (error) {
            logger.error(`Error in channelDelete event for guild ${guildId}:`, error);
        }
    }
};

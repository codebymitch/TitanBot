// voiceMilestoneTracking.js
//
// Listens for voice channel joins/leaves and feeds the elapsed time into the
// voice milestone service. Long-running sessions are flushed periodically from
// the app cron so members still earn tiers without leaving the channel.

import { logger } from '../utils/logger.js';
import {
    trackVoiceJoin,
    trackVoiceLeave,
    trackVoiceMove,
} from '../services/voiceMilestoneService.js';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        try {
            const member = newState.member;
            if (!member || member.user?.bot) return;

            const guildId = newState.guild?.id;
            if (!guildId) return;

            const userId = member.id;
            const oldChannelId = oldState.channelId;
            const newChannelId = newState.channelId;

            if (!oldChannelId && newChannelId) {
                await trackVoiceJoin(client, guildId, userId);
            } else if (oldChannelId && !newChannelId) {
                await trackVoiceLeave(client, guildId, userId);
            } else if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
                await trackVoiceMove(client, guildId, userId);
            }
        } catch (error) {
            logger.error(`voiceMilestoneTracking error for guild ${newState?.guild?.id}:`, error);
        }
    }
};

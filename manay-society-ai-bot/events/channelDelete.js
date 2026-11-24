import { GuildAIConfig } from '../models/GuildAIConfig.js';

export default {
  name: 'channelDelete',
  async execute(channel) {
    if (!channel.guildId) return;
    await GuildAIConfig.updateMany(
      { guildId: channel.guildId },
      {
        $pull: {
          channelIds: channel.id,
          disabledChannelIds: channel.id,
        },
      },
    );
  },
};

import mongoose from 'mongoose';

const guildAIConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  enabled: { type: Boolean, default: true },
  allChannels: { type: Boolean, default: false },
  channelIds: { type: [String], default: [] },
  disabledChannelIds: { type: [String], default: [] },
  personality: {
    type: String,
    enum: ['friendly', 'professional', 'funny', 'custom'],
    default: 'friendly',
  },
  customSystemPrompt: { type: String, default: '' },
  model: { type: String, default: 'gpt-4.1-mini' },
  memoryEnabled: { type: Boolean, default: true },
  maxHistory: { type: Number, default: 16, min: 2, max: 60 },
  dailyLimit: { type: Number, default: 25, min: 1, max: 1000 },
  imageEnabled: { type: Boolean, default: true },
}, { timestamps: true, minimize: false });

export const GuildAIConfig = mongoose.model('GuildAIConfig', guildAIConfigSchema);

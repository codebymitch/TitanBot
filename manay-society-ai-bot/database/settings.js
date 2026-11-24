import { GuildAIConfig } from '../models/GuildAIConfig.js';
import { Usage } from '../models/Usage.js';
import { getEnv } from '../config/env.js';

export async function getGuildConfig(guildId) {
  const env = getEnv();
  try {
    return await GuildAIConfig.findOneAndUpdate(
      { guildId },
      {
        $setOnInsert: {
          guildId,
          model: env.defaultChatModel,
          dailyLimit: env.defaultDailyLimit,
          maxHistory: env.defaultMaxHistory,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return GuildAIConfig.findOne({ guildId });
  }
}

export async function updateGuildConfig(guildId, updates) {
  await getGuildConfig(guildId);
  return GuildAIConfig.findOneAndUpdate(
    { guildId },
    { $set: updates },
    { new: true, runValidators: true },
  );
}

export function getUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

export async function consumeUsage(guildId, userId, dailyLimit) {
  const filter = { guildId, userId, day: getUtcDay() };

  try {
    await Usage.updateOne(
      filter,
      {
        $setOnInsert: {
          ...filter,
          count: 0,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const usage = await Usage.findOneAndUpdate(
    { ...filter, count: { $lt: dailyLimit } },
    { $inc: { count: 1 } },
    { new: true },
  );

  if (!usage) {
    const error = new Error('Daily AI usage limit reached.');
    error.code = 'AI_DAILY_LIMIT';
    throw error;
  }

  return usage.count;
}

export async function getUsageCount(guildId, userId) {
  const usage = await Usage.findOne({
    guildId,
    userId,
    day: getUtcDay(),
  }).lean();
  return usage?.count || 0;
}

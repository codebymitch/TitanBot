import {
  checkCooldown,
  formatAiError,
  generateChatResponse,
  isChannelAllowed,
} from '../ai/service.js';
import { getGuildConfig } from '../database/settings.js';
import { logError } from '../utils/logger.js';
import { splitDiscordMessage } from '../utils/text.js';

export async function handleMessageCreate(message) {
  if (
    !message.guildId
    || message.author?.bot
    || message.webhookId
    || message.system
  ) return;

  const prompt = String(message.content || '').trim();
  if (!prompt) return;

  let typingTimer;
  try {
    const config = await getGuildConfig(message.guildId);
    if (!isChannelAllowed(config, message.channelId)) return;

    const remaining = checkCooldown(message.guildId, message.author.id);
    if (remaining > 0) return;

    await message.channel.sendTyping().catch(() => null);
    typingTimer = setInterval(() => {
      message.channel.sendTyping().catch(() => null);
    }, 8000);

    const response = await generateChatResponse({
      guildId: message.guildId,
      userId: message.author.id,
      prompt,
      config,
    });

    const chunks = splitDiscordMessage(response);
    await message.reply({
      content: chunks[0],
      allowedMentions: { repliedUser: false, parse: [] },
    });
    for (const chunk of chunks.slice(1)) {
      await message.channel.send({ content: chunk, allowedMentions: { parse: [] } });
    }
  } catch (error) {
    logError(`auto-chat guild=${message.guildId} user=${message.author.id}`, error);
    await message.channel.send({
      content: formatAiError(error),
      allowedMentions: { parse: [] },
    }).catch(() => null);
  } finally {
    if (typingTimer) clearInterval(typingTimer);
  }
}

export default {
  name: 'messageCreate',
  execute: handleMessageCreate,
};

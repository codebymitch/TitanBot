import { EmbedBuilder } from 'discord.js';
import { getColor } from '../config/bot.js';

export function createEmbed({
  title = '',
  description = '',
  color = 'primary',
  fields = [],
  author = null,
  footer = null,
  thumbnail = null,
  image = null,
  timestamp = true,
  url = null
} = {}) {
  const embed = new EmbedBuilder();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  embed.setColor(getColor(color));

  if (fields && fields.length > 0) {
    embed.addFields(fields);
  }

  if (author) {
    if (typeof author === 'string') {
      embed.setAuthor({ name: author });
    } else {
      embed.setAuthor(author);
    }
  }

  if (footer) {
    if (typeof footer === 'string') {
      embed.setFooter({ text: footer });
    } else {
      embed.setFooter(footer);
    }
  }

  if (thumbnail) {
    if (typeof thumbnail === 'string') {
      embed.setThumbnail(thumbnail);
    } else {
      embed.setThumbnail(thumbnail.url);
    }
  }

  if (image) {
    if (typeof image === 'string') {
      embed.setImage(image);
    } else {
      embed.setImage(image.url);
    }
  }

  if (timestamp) {
    embed.setTimestamp();
  }

  if (url) {
    embed.setURL(url);
  }

  return embed;
}

export function errorEmbed(message, error = null, options = {}) {
  const { showDetails = process.env.NODE_ENV !== 'production' } = options;
  let description = message;

  if (error && showDetails) {
    const detailText = typeof error === 'string' ? error : (error.message || String(error));
    description = `${message}\n${formatCodeBlock(detailText)}`;
  }

  return createEmbed({
    title: '❌ Error',
    description,
    color: 'error',
    timestamp: true
  });
}

export function successEmbed(message, title = '✅ Success') {
  return createEmbed({
    title,
    description: message,
    color: 'success',
    timestamp: true
  });
}

export function infoEmbed(message, title = 'ℹ️ Information') {
  return createEmbed({
    title,
    description: message,
    color: 'info',
    timestamp: true
  });
}

export function warningEmbed(message, title = '⚠️ Warning') {
  return createEmbed({
    title,
    description: message,
    color: 'warning',
    timestamp: true
  });
}

export function formatUser(user) {
  return `${user} (${user.tag} | ${user.id})`;
}

export function formatDate(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

export function formatRelativeTime(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

export function formatCodeBlock(content, language = '') {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

export function formatInlineCode(content) {
  return `\`${content}\``;
}

export function formatBold(content) {
  return `**${content}**`;
}

export function formatItalic(content) {
  return `*${content}*`;
}

export function formatUnderline(content) {
  return `__${content}__`;
}

export function formatStrikethrough(content) {
  return `~~${content}~~`;
}

export function formatSpoiler(content) {
  return `||${content}||`;
}

export function formatQuote(content) {
  return `> ${content}`;
}

export function formatList(items, ordered = false) {
  return items
    .map((item, index) => (ordered ? `${index + 1}.` : '•') + ` ${item}`)
    .join('\n');
}

export function formatProgressBar(current, max, size = 10) {
  const progress = Math.min(Math.max(0, current / max), 1);
  const filled = Math.round(size * progress);
  const empty = size - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.round(progress * 100)}%`;
}




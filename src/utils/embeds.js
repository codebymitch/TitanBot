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
  
  
  if (title && typeof title === 'string' && title.length > 0) {
    embed.setTitle(title.substring(0, 256));
  }
  
  
  if (description && typeof description === 'string' && description.length > 0) {
    embed.setDescription(description.substring(0, 4096));
  }
  
  
  try {
    const embedColor = getColor(color) || '#000000';
    embed.setColor(embedColor);
  } catch (error) {
    embed.setColor('#000000');
  }

  
  if (Array.isArray(fields) && fields.length > 0) {
    const validFields = fields.filter(f => f && f.name && f.value);
    if (validFields.length > 0) {
      embed.addFields(validFields.slice(0, 25)); 
    }
  }

  
  if (author) {
    try {
      if (typeof author === 'string' && author.length > 0) {
        embed.setAuthor({ name: author.substring(0, 256) });
      } else if (author && typeof author.name === 'string') {
        embed.setAuthor(author);
      }
    } catch (error) {
      
    }
  }

  
  if (footer) {
    try {
      if (typeof footer === 'string' && footer.length > 0) {
        embed.setFooter({ text: footer.substring(0, 2048) });
      } else if (footer && typeof footer.text === 'string') {
        embed.setFooter(footer);
      }
    } catch (error) {
      
    }
  }

  
  if (thumbnail) {
    try {
      if (typeof thumbnail === 'string' && thumbnail.length > 0) {
        embed.setThumbnail(thumbnail);
      } else if (thumbnail && typeof thumbnail.url === 'string') {
        embed.setThumbnail(thumbnail.url);
      }
    } catch (error) {
      
    }
  }

  
  if (image) {
    try {
      if (typeof image === 'string' && image.length > 0) {
        embed.setImage(image);
      } else if (image && typeof image.url === 'string') {
        embed.setImage(image.url);
      }
    } catch (error) {
      
    }
  }

  
  if (timestamp === true) {
    embed.setTimestamp();
  } else if (timestamp instanceof Date) {
    embed.setTimestamp(timestamp);
  }

  
  if (url && typeof url === 'string' && url.length > 0) {
    try {
      embed.setURL(url);
    } catch (error) {
      
    }
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




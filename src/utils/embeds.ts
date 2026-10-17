// embeds.js

import { EmbedBuilder } from 'discord.js';
import type { APIEmbedField, EmbedAuthorOptions, EmbedFooterOptions, RestOrArray, User } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';

const EMOJI_REGEX = /[\p{Extended_Pictographic}\uFE0F]/gu;
const EMBED_FOOTER_SYMBOL = Symbol('nexobotFooterText');
const EMBED_BASE_DESCRIPTION_SYMBOL = Symbol('nexobotBaseDescription');

/** EmbedBuilder carrying the private bookkeeping set by the patched setters below. */
type TaggedEmbedBuilder = EmbedBuilder & {
  [EMBED_FOOTER_SYMBOL]?: string;
  [EMBED_BASE_DESCRIPTION_SYMBOL]?: string;
};

function sanitizeEmbedText(text?: string): string;
function sanitizeEmbedText<T>(text: T): T | string;
function sanitizeEmbedText(text: unknown = ''): unknown {
  if (typeof text !== 'string') {
    return text;
  }

  return text
    .replace(EMOJI_REGEX, '')
    .replace(/[ \t]+/g, ' ')  // Replace consecutive spaces/tabs with single space
    .replace(/[ \t]\n/g, '\n')  // Remove spaces before newlines
    .replace(/\n[ \t]/g, '\n')  // Remove spaces after newlines
    .replace(/\n{3,}/g, '\n\n')  // Limit consecutive newlines to 2
    .trim();
}

function sanitizeEmbedField(field: APIEmbedField): APIEmbedField {
  if (!field || typeof field !== 'object') {
    return field;
  }

  return {
    ...field,
    name: sanitizeEmbedText(field.name),
    value: sanitizeEmbedText(field.value),
  };
}

// The patched setters also accept the legacy string forms the JS callers used.
// Method syntax keeps the parameter check bivariant so the originals can be stored under the wider type.
type LegacySetter<T> = { set(this: EmbedBuilder, value: T): EmbedBuilder }['set'];
type FooterInput = EmbedFooterOptions | string | null | undefined;

const originalSetTitle = EmbedBuilder.prototype.setTitle;
const originalSetAuthor: LegacySetter<EmbedAuthorOptions | string | null> = EmbedBuilder.prototype.setAuthor;
const originalAddFields = EmbedBuilder.prototype.addFields;

EmbedBuilder.prototype.setTitle = function setSanitizedTitle(this: EmbedBuilder, title: string | null) {
  return originalSetTitle.call(this, sanitizeEmbedText(title));
};

EmbedBuilder.prototype.setAuthor = function setSanitizedAuthor(this: EmbedBuilder, author: EmbedAuthorOptions | string | null) {
  if (typeof author === 'string') {
    return originalSetAuthor.call(this, sanitizeEmbedText(author));
  }

  if (author && typeof author.name === 'string') {
    return originalSetAuthor.call(this, {
      ...author,
      name: sanitizeEmbedText(author.name),
    });
  }

  return originalSetAuthor.call(this, author);
};

EmbedBuilder.prototype.addFields = function addSanitizedFields(this: EmbedBuilder, ...fields: RestOrArray<APIEmbedField>) {
  const normalized = fields.flatMap((field) => (Array.isArray(field) ? field : [field]));
  const sanitized = normalized.map(sanitizeEmbedField);
  return originalAddFields.call(this, sanitized);
};

function normalizeFooterText(footer: FooterInput): string {
  if (!footer) {
    return '';
  }

  if (typeof footer === 'string') {
    return footer.trim();
  }

  if (footer && typeof footer.text === 'string') {
    return footer.text.trim();
  }

  return '';
}

function isImportantFooter(footerText: string): boolean {
  if (!footerText) {
    return false;
  }

  const normalized = footerText.toLowerCase();
  return /\b(close|closes|closed|expire|expires|available in|page\s+\d+|dashboard closes|ticket id)\b/.test(normalized)
    || /schließ|geschlossen|läuft\b.*\bab\b|abgelaufen|ablauf|verfügbar in|seite\s+\d+|ticket-id/.test(normalized);
}

const originalSetDescription = EmbedBuilder.prototype.setDescription;
const originalSetFooter: LegacySetter<FooterInput> = EmbedBuilder.prototype.setFooter;
const originalSetTimestamp = EmbedBuilder.prototype.setTimestamp;

EmbedBuilder.prototype.setDescription = function(this: TaggedEmbedBuilder, description: string | null = '') {
  const descString = sanitizeEmbedText(description || '');
  this[EMBED_BASE_DESCRIPTION_SYMBOL] = descString;
  return originalSetDescription.call(this, descString);
};

EmbedBuilder.prototype.setFooter = function(this: TaggedEmbedBuilder, footer: FooterInput) {
  const footerText = sanitizeEmbedText(normalizeFooterText(footer));
  if (!footerText || !isImportantFooter(footerText)) {
    return this;
  }

  this[EMBED_FOOTER_SYMBOL] = footerText;
  return originalSetFooter.call(this, { text: footerText });
};

EmbedBuilder.prototype.setTimestamp = function(this: EmbedBuilder) {
  return this;
};

export interface CreateEmbedOptions {
  title?: string | null;
  description?: string | null;
  color?: string | number;
  fields?: APIEmbedField[];
  author?: string | EmbedAuthorOptions | null;
  footer?: string | EmbedFooterOptions | null;
  thumbnail?: string | { url: string } | null;
  image?: string | { url: string } | null;
  timestamp?: boolean | Date;
  url?: string | null;
}

export function createEmbed({
  title = '',
  description = '',
  color = 'primary',
  fields = [],
  author = null,
  footer = null,
  thumbnail = null,
  image = null,
  timestamp = false,
  url = null
}: CreateEmbedOptions = {}): EmbedBuilder {
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
      } else if (author && typeof author !== 'string' && typeof author.name === 'string') {
        embed.setAuthor(author);
      }
    } catch (error) {
      
    }
  } else if (botConfig.embeds?.author?.name) {
    embed.setAuthor({
      name: botConfig.embeds.author.name,
      ...(botConfig.embeds.author.icon ? { iconURL: botConfig.embeds.author.icon } : {}),
      ...(botConfig.embeds.author.url ? { url: botConfig.embeds.author.url } : {}),
    });
  }

  if (footer) {
    try {
      if (typeof footer === 'string' && footer.length > 0) {
        embed.setFooter({ text: footer.substring(0, 2048) });
      } else if (footer && typeof footer !== 'string' && typeof footer.text === 'string') {
        embed.setFooter(footer);
      }
    } catch (error) {
      
    }
  } else if (botConfig.embeds?.footer?.text) {
    const defaultFooter = {
      text: botConfig.embeds.footer.text,
      ...(botConfig.embeds.footer.icon ? { iconURL: botConfig.embeds.footer.icon } : {}),
    };
    embed.setFooter(defaultFooter);
  }

  if (thumbnail) {
    try {
      if (typeof thumbnail === 'string' && thumbnail.length > 0) {
        embed.setThumbnail(thumbnail);
      } else if (thumbnail && typeof thumbnail !== 'string' && typeof thumbnail.url === 'string') {
        embed.setThumbnail(thumbnail.url);
      }
    } catch (error) {
      
    }
  } else if (botConfig.embeds?.thumbnail) {
    embed.setThumbnail(botConfig.embeds.thumbnail);
  }

  if (image) {
    try {
      if (typeof image === 'string' && image.length > 0) {
        embed.setImage(image);
      } else if (image && typeof image !== 'string' && typeof image.url === 'string') {
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

const NOTIFICATION_DEFAULT_TITLES: Record<string, string> = {
  success: 'Erfolg',
  error: 'Fehler',
  info: 'Information',
  warning: 'Warnung',
  primary: 'Hinweis',
};

export const USER_ERROR_TITLES: Record<string, string> = {
  validation: 'Ungültige Eingabe',
  permission: 'Keine Berechtigung',
  configuration: 'Konfigurationsfehler',
  database: 'Datenbankfehler',
  network: 'Netzwerkfehler',
  discord_api: 'Discord-API-Fehler',
  user_input: 'Eingabefehler',
  rate_limit: 'Zu schnell',
  unknown: 'Etwas ist schiefgelaufen',
};

const USER_ERROR_COLORS: Record<string, string> = {
  rate_limit: 'warning',
};

/**
 * Build a consistent user-facing error embed.
 * @param {string} errorType - Error category key (e.g. validation, permission)
 * @param {string} [description] - Specific, actionable message for the user
 * @param {{ titleOverride?: string }} [options]
 */
export function buildUserErrorEmbed(errorType: string | null | undefined, description: string | null = '', options: { titleOverride?: string } = {}): EmbedBuilder {
  const type = errorType || 'unknown';
  const title = options.titleOverride || USER_ERROR_TITLES[type] || USER_ERROR_TITLES.unknown;
  const color = USER_ERROR_COLORS[type] || 'error';
  const body = description ? String(description).trim() : undefined;

  return createEmbed({
    title,
    description: body,
    color,
  });
}

function containsDiscordRenderable(content: unknown = ''): boolean {
  return /<@!?&?\d+>|<#\d+>|\b\d{17,19}\b/.test(String(content));
}

function buildNotificationEmbed(title: string | null | undefined, body: string | null | undefined = '', color: string = 'primary'): EmbedBuilder {
  const defaultTitle = NOTIFICATION_DEFAULT_TITLES[color] || NOTIFICATION_DEFAULT_TITLES.primary;
  let titleText = String(title || '').trim();
  let bodyText = body ? String(body).trim() : '';

  if (titleText && containsDiscordRenderable(titleText)) {
    bodyText = bodyText ? `${titleText}\n\n${bodyText}` : titleText;
    titleText = defaultTitle;
  }

  return createEmbed({
    title: titleText || defaultTitle,
    description: bodyText || undefined,
    color,
  });
}

/**
 * @deprecated Prefer buildUserErrorEmbed or replyUserError from errorHandler.js.
 */
export function errorEmbed(title?: string | null, detail: unknown = null, options: { showDetails?: boolean } = {}): EmbedBuilder {
  const { showDetails = process.env.NODE_ENV !== 'production' } = options;
  let body = detail;

  if (detail && showDetails && typeof detail !== 'string') {
    const detailText = (detail as { message?: unknown }).message || String(detail);
    body = formatCodeBlock(detailText);
  }

  const description = body ? String(body).trim() : '';
  const titleOverride = title && title !== 'Error' && title !== 'Fehler' ? title : undefined;

  return buildUserErrorEmbed('unknown', description, { titleOverride });
}

/** @param {string} titleOrBody - With one arg: body text. With two args: title and body. */
export function successEmbed(title?: string | null, body: string | null = ''): EmbedBuilder {
  if (arguments.length === 1) {
    return buildNotificationEmbed('Erfolg', title, 'success');
  }

  return buildNotificationEmbed(title || 'Erfolg', body, 'success');
}

/** @param {string} titleOrBody - With one arg: body text. With two args: title and body. */
export function infoEmbed(title?: string | null, body: string | null = ''): EmbedBuilder {
  if (arguments.length === 1) {
    return buildNotificationEmbed('Information', title, 'info');
  }

  return buildNotificationEmbed(title || 'Information', body, 'info');
}

/** @param {string} titleOrBody - With one arg: body text. With two args: title and body. */
export function warningEmbed(title?: string | null, body: string | null = ''): EmbedBuilder {
  if (arguments.length === 1) {
    return buildNotificationEmbed('Warnung', title, 'warning');
  }

  return buildNotificationEmbed(title || 'Warnung', body, 'warning');
}

export function formatUser(user: User): string {
  return `${user} (${user.tag} | ${user.id})`;
}

export function formatDate(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

export function formatRelativeTime(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

export function formatCodeBlock(content: unknown, language: string = ''): string {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

export function formatInlineCode(content: unknown): string {
  return `\`${content}\``;
}

export function formatBold(content: unknown): string {
  return `**${content}**`;
}

export function formatItalic(content: unknown): string {
  return `*${content}*`;
}

export function formatUnderline(content: unknown): string {
  return `__${content}__`;
}

export function formatStrikethrough(content: unknown): string {
  return `~~${content}~~`;
}

export function formatSpoiler(content: unknown): string {
  return `||${content}||`;
}

export function formatQuote(content: unknown): string {
  return `> ${content}`;
}

export function formatList(items: unknown[], ordered: boolean = false): string {
  return items
    .map((item, index) => (ordered ? `${index + 1}.` : '•') + `${item}`)
    .join('\n');
}

export function formatDuration(ms: number): string {
  if (ms < 0) return '0s';

  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join('');
}

export function formatProgressBar(current: number, max: number, size: number = 10): string {
  const progress = Math.min(Math.max(0, current / max), 1);
  const filled = Math.round(size * progress);
  const empty = size - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.round(progress * 100)}%`;
}
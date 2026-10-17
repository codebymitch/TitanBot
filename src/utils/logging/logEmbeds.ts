// logEmbeds.js — shared helpers for clean, scannable log embeds

import { EmbedBuilder } from 'discord.js';
import type { APIEmbedField, Client, ColorResolvable, Guild, Role } from 'discord.js';

export interface LogField {
  name: string;
  value: unknown;
  inline?: boolean;
}

export type LogMetaEntry = [label: string, value: unknown];

export interface LogDescriptionOptions {
  headline?: string | null;
  lines?: string[];
  quoted?: boolean;
  meta?: LogMetaEntry[];
}

export interface LogFooterOptions {
  guild?: Guild | null;
  executorId?: string | null;
  executorTag?: string | null;
  executorAvatar?: string | null;
  footerText?: string | null;
}

export interface LogAuthor {
  name: string;
  iconURL?: string;
}

export interface StandardLogEmbedOptions {
  color: ColorResolvable | null;
  title?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  image?: string | null;
  inlineFields?: LogField[];
  fields?: LogField[];
  author?: { name?: string | null; iconURL?: string | null } | null;
  timestamp?: boolean;
  footer?: { text?: string | null; iconURL?: string | null } | null;
}

const EMOJI_PREFIX = /^[\p{Extended_Pictographic}\uFE0F\s]+/u;

export function stripFieldLabel(name: string = ''): string {
  return name.replace(EMOJI_PREFIX, '').trim() || name;
}

export function formatLogLine(label: string, value: unknown): string {
  return `**${label}:** ${value}`;
}

export function formatMetaLine(entries: LogMetaEntry[]): string {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => `**${label}:** ${value}`)
    .join(' • ');
}

export function buildQuotedBlock(lines: string[]): string {
  return lines.map((line) => `> ${line}`).join('\n');
}

export function buildLogDescription({ headline, lines = [], quoted = false, meta = [] }: LogDescriptionOptions = {}): string {
  const parts: string[] = [];

  if (headline) {
    parts.push(headline);
  }

  if (lines.length > 0) {
    parts.push(quoted ? buildQuotedBlock(lines) : lines.join('\n'));
  }

  if (meta.length > 0) {
    parts.push(formatMetaLine(meta));
  }

  return parts.join('\n\n').slice(0, 4096);
}

export function fieldsToLines(fields: LogField[] = []): string[] {
  return fields.map((field) => formatLogLine(stripFieldLabel(field.name), field.value));
}

export interface ComparisonFields {
  before: unknown;
  after: unknown;
  rest: LogField[];
}

export function splitComparisonFields(fields: LogField[] = []): ComparisonFields {
  const comparison: ComparisonFields = { before: null, after: null, rest: [] };

  for (const field of fields) {
    const label = stripFieldLabel(field.name).toLowerCase();

    if (/^old|^before|^alt|^vorher/.test(label)) {
      comparison.before = field.value;
    } else if (/^new|^after|^neu|^nachher/.test(label)) {
      comparison.after = field.value;
    } else {
      comparison.rest.push(field);
    }
  }

  return comparison;
}

export function applyLogFooter(embed: EmbedBuilder, { guild, executorId, executorTag, executorAvatar, footerText }: LogFooterOptions = {}): EmbedBuilder {
  if (footerText) {
    embed.setFooter({ text: footerText.slice(0, 2048), iconURL: executorAvatar || undefined });
    return embed;
  }

  if (executorId && executorTag) {
    embed.setFooter({
      text: `${executorTag} • `,
      iconURL: executorAvatar || undefined,
    });
    return embed;
  }

  if (guild) {
    embed.setFooter({
      text: guild.name,
      iconURL: guild.iconURL() || undefined,
    });
  }

  return embed;
}

export function appendContentSection(description: string = '', label: string, content: string | null | undefined): string {
  if (!content) {
    return description;
  }

  const base = description?.trim() || '';
  const section = `**${label}**\n${content}`;
  return base ? `${base}\n\n${section}`.slice(0, 4096) : section.slice(0, 4096);
}

export function formatRatingStars(rating: unknown): string | null {
  const numeric = Number(rating);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return null;
  }

  const clamped = Math.min(5, Math.max(1, Math.round(numeric)));
  return `${'⭐'.repeat(clamped)} (${clamped}/5)`;
}

export async function resolveUserAuthor(client: Client, userId: string | null | undefined): Promise<LogAuthor | null> {
  if (!userId) {
    return null;
  }

  try {
    const user = await client.users.fetch(userId);
    return {
      name: user.tag,
      iconURL: user.displayAvatarURL(),
    };
  } catch {
    return {
      name: `Nutzer ${userId}`,
    };
  }
}

export function buildStandardLogEmbed({
  color,
  title,
  description,
  thumbnail,
  image,
  inlineFields = [],
  fields = [],
  author = null,
  timestamp = true,
  footer,
}: StandardLogEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(color);

  if (title) embed.setTitle(title.slice(0, 256));
  if (description) embed.setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (author?.name) {
    embed.setAuthor({
      name: author.name.slice(0, 256),
      iconURL: author.iconURL || undefined,
    });
  }

  const combinedFields = [...inlineFields, ...fields];
  if (combinedFields.length > 0) {
    embed.addFields(
      combinedFields.map((field) => ({
        name: field.name.slice(0, 256),
        value: String(field.value).slice(0, 1024),
        inline: field.inline === true,
      }))
    );
  }

  if (timestamp) embed.setTimestamp();

  if (footer?.text) {
    embed.setFooter({
      text: footer.text.slice(0, 2048),
      iconURL: footer.iconURL || undefined,
    });
  }

  return embed;
}

const MAX_DISPLAYED_ROLE_PERMISSIONS = 5;

export interface RoleAuditOptions {
  includeMemberCount?: boolean;
}

export function buildRoleAuditFields(role: Role, { includeMemberCount = false }: RoleAuditOptions = {}): APIEmbedField[] {
  const fields: APIEmbedField[] = [
    {
      name: 'Rollenname',
      value: role.name,
      inline: true
    },
    {
      name: 'Farbe',
      value: role.hexColor || '#000000',
      inline: true
    },
    {
      name: 'Rollen-ID',
      value: role.id,
      inline: true
    }
  ];

  const permissions = role.permissions.toArray();
  if (permissions.length > 0) {
    const displayPerms = permissions.slice(0, MAX_DISPLAYED_ROLE_PERMISSIONS).join(',');
    fields.push({
      name: 'Berechtigungen',
      value: permissions.length > MAX_DISPLAYED_ROLE_PERMISSIONS
        ? `${displayPerms}... (+${permissions.length - MAX_DISPLAYED_ROLE_PERMISSIONS} weitere)`
        : displayPerms,
      inline: false
    });
  }

  fields.push(
    {
      name: 'Separat angezeigt',
      value: role.hoist ? 'Ja' : 'Nein',
      inline: true
    },
    {
      name: 'Verwaltet',
      value: role.managed ? 'Ja (Bot-Rolle)' : 'Nein',
      inline: true
    },
    {
      name: 'Position',
      value: role.position.toString(),
      inline: true
    }
  );

  if (includeMemberCount) {
    fields.push({
      name: 'Mitglieder mit Rolle',
      value: role.members.size.toString(),
      inline: true
    });
  }

  return fields;
}

export function buildRoleAuditLines(role: Role, options: RoleAuditOptions = {}): string[] {
  return buildRoleAuditFields(role, options).map((field) =>
    formatLogLine(field.name, field.value),
  );
}

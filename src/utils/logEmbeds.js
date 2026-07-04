// logEmbeds.js — shared helpers for clean, scannable log embeds

import { EmbedBuilder } from 'discord.js';

const EMOJI_PREFIX = /^[\p{Extended_Pictographic}\uFE0F\s]+/u;

export function stripFieldLabel(name = '') {
  return name.replace(EMOJI_PREFIX, '').trim() || name;
}

export function formatLogLine(label, value) {
  return `**${label}:** ${value}`;
}

export function formatMetaLine(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => `**${label}:** ${value}`)
    .join(' • ');
}

export function buildQuotedBlock(lines) {
  return lines.map((line) => `> ${line}`).join('\n');
}

export function buildLogDescription({ headline, lines = [], quoted = false, meta = [] } = {}) {
  const parts = [];

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

export function fieldsToLines(fields = []) {
  return fields.map((field) => formatLogLine(stripFieldLabel(field.name), field.value));
}

export function splitComparisonFields(fields = []) {
  const comparison = { before: null, after: null, rest: [] };

  for (const field of fields) {
    const label = stripFieldLabel(field.name).toLowerCase();

    if (/^old|^before/.test(label)) {
      comparison.before = field.value;
    } else if (/^new|^after/.test(label)) {
      comparison.after = field.value;
    } else {
      comparison.rest.push(field);
    }
  }

  return comparison;
}

export function applyLogFooter(embed, { guild, executorId, executorTag, executorAvatar, footerText } = {}) {
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
      iconURL: guild.iconURL({ dynamic: true }) || undefined,
    });
  }

  return embed;
}

export function appendContentSection(description = '', label, content) {
  if (!content) {
    return description;
  }

  const base = description?.trim() || '';
  const section = `**${label}**\n${content}`;
  return base ? `${base}\n\n${section}`.slice(0, 4096) : section.slice(0, 4096);
}

export function formatRatingStars(rating) {
  const numeric = Number(rating);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return null;
  }

  const clamped = Math.min(5, Math.max(1, Math.round(numeric)));
  return `${'⭐'.repeat(clamped)} (${clamped}/5)`;
}

export async function resolveUserAuthor(client, userId) {
  if (!userId) {
    return null;
  }

  try {
    const user = await client.users.fetch(userId);
    return {
      name: user.tag,
      iconURL: user.displayAvatarURL({ dynamic: true }),
    };
  } catch {
    return {
      name: `User ${userId}`,
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
}) {
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

export function buildRoleAuditFields(role, { includeMemberCount = false } = {}) {
  const fields = [
    {
      name: 'Role Name',
      value: role.name,
      inline: true
    },
    {
      name: 'Color',
      value: role.hexColor || '#000000',
      inline: true
    },
    {
      name: 'Role ID',
      value: role.id,
      inline: true
    }
  ];

  const permissions = role.permissions.toArray();
  if (permissions.length > 0) {
    const displayPerms = permissions.slice(0, MAX_DISPLAYED_ROLE_PERMISSIONS).join(',');
    fields.push({
      name: 'Permissions',
      value: permissions.length > MAX_DISPLAYED_ROLE_PERMISSIONS
        ? `${displayPerms}... (+${permissions.length - MAX_DISPLAYED_ROLE_PERMISSIONS} more)`
        : displayPerms,
      inline: false
    });
  }

  fields.push(
    {
      name: 'Hoisted',
      value: role.hoist ? 'Yes' : 'No',
      inline: true
    },
    {
      name: 'Managed',
      value: role.managed ? 'Yes (Bot role)' : 'No',
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
      name: 'Members with Role',
      value: role.members.size.toString(),
      inline: true
    });
  }

  return fields;
}

export function buildRoleAuditLines(role, options = {}) {
  return buildRoleAuditFields(role, options).map((field) =>
    formatLogLine(field.name, field.value),
  );
}

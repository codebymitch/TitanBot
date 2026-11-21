import {
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { logger } from '../utils/logger.js';

const COLOR = 0x39ff88;

const getKey = (guildId) => `guild:${guildId}:boosts`;

const DEFAULT_CONFIG = {
  enabled: false,
  channelId: null,
  roleId: null,
  message: null,
};

async function getConfig(client, guildId) {
  return {
    ...DEFAULT_CONFIG,
    ...(await client.db.get(getKey(guildId), {})),
  };
}

function formatMessage(template, user, guild, count) {
  return template
    .replaceAll('{user}', user.toString())
    .replaceAll('{server}', guild.name)
    .replaceAll('{boosts}', String(count));
}

async function updateBoosterRole(member, config, started, ended) {
  if (!config.roleId) return;

  const guild = member.guild;
  const role = await guild.roles.fetch(config.roleId).catch(() => null);
  const botMember = guild.members.me;

  if (!role || !botMember) return;

  if (role.managed) return;

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    logger.warn('Cannot manage booster role: missing ManageRoles permission.');
    return;
  }

  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    logger.warn(`Cannot manage booster role ${role.id}: role hierarchy is too high.`);
    return;
  }

  try {
    if (started && !member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Member started boosting the server.');
    }

    if (ended && member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Member stopped boosting the server.');
    }
  } catch (error) {
    logger.error('Failed to update booster role:', error);
  }
}

async function sendBoostAnnouncement(member, config, started) {
  if (!config.enabled || !config.channelId) return;

  const guild = member.guild;

  const channel = await guild.channels
    .fetch(config.channelId)
    .catch(() => null);

  if (!channel?.isTextBased() || !channel.send) {
    logger.warn(`Boost announcement channel unavailable in guild ${guild.id}`);
    return;
  }

  const count = guild.premiumSubscriptionCount ?? 0;

  const defaultMessage = started
    ? 'Thank you {user} for boosting **{server}**! Your support means a lot to us. 💚'
    : 'Thank you {user} for supporting **{server}**. Your boost has ended. We appreciate your support! 💚';

  const template = config.message || defaultMessage;

  const description = formatMessage(
    template,
    member.user,
    guild,
    count,
  );

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(
      started
        ? '💚 New Server Booster!'
        : '💚 Server Boost Ended',
    )
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      {
        name: 'Member',
        value: member.user.toString(),
        inline: true,
      },
      {
        name: 'Total Server Boosts',
        value: String(count),
        inline: true,
      },
    )
    .setFooter({ text: 'Zee • Server Boost System' })
    .setTimestamp();

  await channel.send({
    embeds: [embed],
    allowedMentions: {
      users: [member.id],
      roles: [],
      parse: [],
    },
  });
}

export async function handleBoostUpdate(oldMember, newMember) {
  try {
    const oldBoost = oldMember.premiumSinceTimestamp ?? null;
    const newBoost = newMember.premiumSinceTimestamp ?? null;

    // Ignore unrelated member updates.
    if (oldBoost === newBoost) return;

    const started = !oldBoost && Boolean(newBoost);
    const ended = Boolean(oldBoost) && !newBoost;

    if (!started && !ended) return;

    const config = await getConfig(
      newMember.client,
      newMember.guild.id,
    );

    // Update the configured booster role.
    await updateBoosterRole(
      newMember,
      config,
      started,
      ended,
    );

    // Send the announcement.
    await sendBoostAnnouncement(
      newMember,
      config,
      started,
    );

    logger.info(
      `Server boost ${started ? 'started' : 'ended'}: ${newMember.user.tag}`,
      {
        guildId: newMember.guild.id,
        userId: newMember.id,
      },
    );
  } catch (error) {
    logger.error('Error processing server boost update:', {
      guildId: newMember.guild?.id,
      userId: newMember.id,
      error: error.message,
    });
  }
                }

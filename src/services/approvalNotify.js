import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} from 'discord.js';
import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';
import { t, pickLanguage } from './i18n.js';
import { getGuildConfig } from './guildConfigService.js';

/**
 * Post a one-time "your server is approved, pick a language" setup
 * message in a newly-approved guild. Fails silently if the bot can't
 * find a writable channel.
 */
export async function postApprovalSetup(client, guildId) {
  try {
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return false;

    const me = guild.members.me;
    const canSend = (ch) =>
      ch &&
      ch.isTextBased?.() &&
      ch.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) &&
      ch.permissionsFor(me)?.has(PermissionsBitField.Flags.EmbedLinks);

    let channel = guild.systemChannel && canSend(guild.systemChannel) ? guild.systemChannel : null;
    if (!channel) {
      channel = guild.channels.cache
        .filter((c) => canSend(c))
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .first();
    }
    if (!channel) {
      logger.warn(`approvalNotify: no writable channel in guild ${guildId}`);
      return false;
    }

    const config = await getGuildConfig(client.db, guildId).catch(() => ({}));
    const lang = pickLanguage(config, guild);
    const brand = botConfig.brand?.name || 'Wolf';
    const dashboardUrl = botConfig.brand?.dashboardUrl || '';
    const logoPath = botConfig.brand?.logoPath || '/assets/logo.png';
    const logoUrl = dashboardUrl ? `${dashboardUrl.replace(/\/$/, '')}${logoPath}` : null;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wolf_lang:es').setLabel(t(lang, 'wolf.setup.langButtonES')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('wolf_lang:en').setLabel(t(lang, 'wolf.setup.langButtonEN')).setStyle(ButtonStyle.Secondary),
    );

    const components = [row];
    if (dashboardUrl) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setURL(dashboardUrl).setLabel(t(lang, 'wolf.setup.panelButton')).setStyle(ButtonStyle.Link),
        ),
      );
    }

    await channel.send({
      embeds: [{
        color: 0x7b6cff,
        title: t(lang, 'wolf.setup.title', { brand }),
        description: `${t(lang, 'wolf.setup.description')}\n\n*${t(lang, 'wolf.setup.note')}*`,
        thumbnail: logoUrl ? { url: logoUrl } : undefined,
        footer: { text: brand },
      }],
      components,
    });
    return true;
  } catch (err) {
    logger.error('approvalNotify failed', { error: err?.message, guildId });
    return false;
  }
}

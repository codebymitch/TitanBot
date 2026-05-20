import { PermissionFlagsBits } from 'discord.js';

import {
  getLoggingStatus,
  EVENT_TYPES,
  setLoggingEnabled,
  setEventEnabled,
  setAllCategoriesEnabled
} from '../services/loggingService.js';

import {
  parseEventTypeFromButton
} from '../utils/loggingUi.js';

import { logger }
  from '../utils/logger.js';

import {
  buildLoggingDashboardView
} from '../commands/Logging/modules/logging_dashboard.js';

import { getGuildConfig } from '../services/guildConfig.js';
import { t, pickLanguage } from '../services/i18n.js';

const LOGGING_CATEGORIES = [
  ...new Set(
    Object.values(EVENT_TYPES)
      .map(
        (eventType) =>
          eventType.split('.')[0]
      )
  )
];

async function getLang(interaction) {
  try {
    const config = await getGuildConfig(interaction.client, interaction.guildId);
    return pickLanguage(config, interaction.guild);
  } catch {
    return 'es';
  }
}

export default {

  customIds: [
    'logging_toggle',
    'logging_refresh_status',
    'log_dash_toggle',
    'log_dash_refresh'
  ],

  async execute(interaction) {

    try {

      if (
        !interaction.member.permissions.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {
        const lang = await getLang(interaction);
        return interaction.reply({
          content: t(lang, 'wolf.cmd.logging.buttons.noPermsContent'),
          ephemeral: true
        });

      }

      // 🔥 DASHBOARD BUTTONS
      if (
        interaction.customId ===
        'log_dash_refresh'
      ) {

        return await handleDashboardRefresh(
          interaction
        );

      }

      if (
        interaction.customId.startsWith(
          'log_dash_toggle'
        )
      ) {

        return await handleDashboardToggle(
          interaction
        );

      }

      // 🔥 LEGACY BUTTONS
      if (
        interaction.customId ===
        'logging_refresh_status'
      ) {

        return await handleRefresh(
          interaction
        );

      }

      if (
        interaction.customId.startsWith(
          'logging_toggle'
        )
      ) {

        return await handleToggle(
          interaction
        );

      }

    } catch (error) {

      logger.error(
        'Error in logging button handler:',
        error
      );

      const lang = await getLang(interaction);
      await interaction.reply({
        content: t(lang, 'wolf.cmd.logging.buttons.errGeneral'),
        ephemeral: true
      }).catch(() => {});

    }
  }
};

async function handleToggle(
  interaction
) {

  try {

    const key =
      parseEventTypeFromButton(
        interaction.customId
      );

    if (!key) {
      const lang = await getLang(interaction);
      return interaction.reply({
        content: t(lang, 'wolf.cmd.logging.buttons.invalidEventType'),
        ephemeral: true
      });

    }

    const status =
      await getLoggingStatus(
        interaction.client,
        interaction.guildId
      );

    const enabledEvents = status.enabledEvents || {};

    if (key === 'audit_enabled') {

      await setLoggingEnabled(
        interaction.client,
        interaction.guildId,
        !Boolean(status.enabled)
      );

    } else if (key === 'all') {

      const allOn = LOGGING_CATEGORIES.every(
        (category) => enabledEvents[`${category}.*`] !== false
      );

      await setAllCategoriesEnabled(
        interaction.client,
        interaction.guildId,
        !allOn
      );

    } else {

      const currentlyEnabled = enabledEvents[key] !== false;

      await setEventEnabled(
        interaction.client,
        interaction.guildId,
        key,
        !currentlyEnabled
      );

    }

    const lang = await getLang(interaction);
    const {
      embed,
      components
    } =
      await buildLoggingDashboardView(
        interaction,
        interaction.client,
        lang
      );

    await interaction.update({
      embeds: [embed],
      components
    });

  } catch (error) {

    logger.error(
      'Error toggling logging:',
      error
    );

    const lang = await getLang(interaction);
    await interaction.reply({
      content: t(lang, 'wolf.cmd.logging.buttons.errToggle'),
      ephemeral: true
    });

  }
}

async function handleRefresh(
  interaction
) {

  try {

    const lang = await getLang(interaction);
    const {
      embed,
      components
    } =
      await buildLoggingDashboardView(
        interaction,
        interaction.client,
        lang
      );

    await interaction.update({
      embeds: [embed],
      components
    });

  } catch (error) {

    logger.error(
      'Error refreshing logging status:',
      error
    );

    const lang = await getLang(interaction);
    await interaction.reply({
      content: t(lang, 'wolf.cmd.logging.buttons.errRefresh'),
      ephemeral: true
    });

  }
}

// ───────────────────────────────
// 🔥 DASHBOARD BUTTONS
// ───────────────────────────────

async function handleDashboardToggle(
  interaction
) {

  try {

    const key =
      interaction.customId.replace(
        'log_dash_toggle:',
        ''
      );

    if (!key) {
      const lang = await getLang(interaction);
      return interaction.reply({
        content: t(lang, 'wolf.cmd.logging.buttons.invalidEventType'),
        ephemeral: true
      });

    }

    const status =
      await getLoggingStatus(
        interaction.client,
        interaction.guildId
      );

    const enabledEvents = status.enabledEvents || {};

    if (key === 'audit_enabled') {

      // global on/off
      await setLoggingEnabled(
        interaction.client,
        interaction.guildId,
        !Boolean(status.enabled)
      );

    } else if (key === 'all') {

      // flip every category at once
      const allOn = LOGGING_CATEGORIES.every(
        (category) => enabledEvents[`${category}.*`] !== false
      );

      await setAllCategoriesEnabled(
        interaction.client,
        interaction.guildId,
        !allOn
      );

    } else {

      // a single category wildcard ('member.*') or specific event
      const currentlyEnabled = enabledEvents[key] !== false;

      await setEventEnabled(
        interaction.client,
        interaction.guildId,
        key,
        !currentlyEnabled
      );

    }

    const lang = await getLang(interaction);
    const {
      embed,
      components
    } =
      await buildLoggingDashboardView(
        interaction,
        interaction.client,
        lang
      );

    await interaction.update({
      embeds: [embed],
      components
    });

  } catch (error) {

    logger.error(
      'Error in dashboard toggle:',
      error
    );

    const lang = await getLang(interaction);
    await interaction.reply({
      content: t(lang, 'wolf.cmd.logging.buttons.errDashToggle'),
      ephemeral: true
    });

  }
}

async function handleDashboardRefresh(
  interaction
) {

  try {

    const lang = await getLang(interaction);
    const {
      embed,
      components
    } =
      await buildLoggingDashboardView(
        interaction,
        interaction.client,
        lang
      );

    await interaction.update({
      embeds: [embed],
      components
    });

  } catch (error) {

    logger.error(
      'Error refreshing logging dashboard:',
      error
    );

    const lang = await getLang(interaction);
    await interaction.reply({
      content: t(lang, 'wolf.cmd.logging.buttons.errDashRefresh'),
      ephemeral: true
    });

  }
}

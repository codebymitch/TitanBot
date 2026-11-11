import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import {
  getBotMessage,
  isBotOwner,
  isCommandCategoryEnabled,
  isMaintenanceMode,
} from '../config/bot.js';
import botConfig from '../config/bot.js';
import { handleApplicationModal } from '../commands/Community/apply.js';
import { handleInteractionError, createError, ErrorTypes, ErrorCodes } from '../utils/errorHandler.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { createInteractionTraceContext, runWithTraceContext } from '../utils/logger.js';
import { isCollectorManagedComponent } from '../utils/collectorComponents.js';
import { ResponseCoordinator } from '../utils/responseCoordinator.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { enforceDefaultCommandPermissions } from '../utils/permissionGuard.js';

function getSlashAccessKey(interaction) {
  const commandName = interaction.commandName;
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand(false);

  if (subcommandGroup && subcommand) {
    return `${commandName} ${subcommandGroup} ${subcommand}`;
  }
  return subcommand ? `${commandName} ${subcommand}` : commandName;
}

async function executeChatInputCommand(interaction, client, traceContext) {
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    throw createError(
      `No command matching ${interaction.commandName} was found.`,
      ErrorTypes.CONFIGURATION,
      'Sorry, that command does not exist.',
      { commandName: interaction.commandName, traceId: traceContext.traceId }
    );
  }

  if (isMaintenanceMode() && !isBotOwner(interaction.user.id)) {
    throw createError('Bot is in maintenance mode', ErrorTypes.CONFIGURATION, getBotMessage('maintenanceMode'));
  }

  if (!isCommandCategoryEnabled(command.category)) {
    throw createError(
      `Feature disabled for category ${command.category}`,
      ErrorTypes.CONFIGURATION,
      getBotMessage('commandDisabled')
    );
  }

  const defaultCooldownSec = Number(botConfig.commands?.defaultCooldown) || 0;
  if (defaultCooldownSec > 0 && !isBotOwner(interaction.user.id)) {
    const cooldownKey = `${interaction.user.id}:${interaction.commandName}`;
    const expiresAt = client.cooldowns.get(cooldownKey);
    if (expiresAt && Date.now() < expiresAt) {
      const remainingSec = Math.ceil((expiresAt - Date.now()) / 1000);
      throw createError(
        `Default command cooldown active for ${interaction.commandName}`,
        ErrorTypes.RATE_LIMIT,
        getBotMessage('cooldownActive', { time: `${remainingSec}s` })
      );
    }
    client.cooldowns.set(cooldownKey, Date.now() + defaultCooldownSec * 1000);
  }

  const abuseProtection = await enforceAbuseProtection(interaction, command, interaction.commandName);
  if (!abuseProtection.allowed) {
    const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
    throw createError(
      `Risky command cooldown active for ${interaction.commandName}`,
      ErrorTypes.RATE_LIMIT,
      `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
      { expected: true, subtype: 'command_cooldown' }
    );
  }

  let guildConfig = null;
  if (interaction.guildId) {
    guildConfig = await getGuildConfig(client, interaction.guildId, traceContext);
    const accessKey = getSlashAccessKey(interaction);
    if (!(await isCommandEnabled(client, interaction.guildId, accessKey, command.category))) {
      throw createError(
        `Command ${accessKey} is disabled in this guild`,
        ErrorTypes.CONFIGURATION,
        'This command has been disabled for this server.',
        { commandName: accessKey, guildId: interaction.guildId }
      );
    }
  }

  const permissionAllowed = await enforceDefaultCommandPermissions(interaction, command, {
    source: 'interactionCreate',
    guildConfig,
  });
  if (permissionAllowed) {
    await command.execute(interaction, guildConfig, client);
  }
}

async function handleAutocomplete(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (command?.autocomplete) {
    await command.autocomplete(interaction, client);
    return;
  }

  const focusedOption = interaction.options.getFocused(true);
  if (
    ['apply', 'app-admin'].includes(interaction.commandName)
    && focusedOption.name === 'application'
  ) {
    try {
      const { getApplicationRoles } = await import('../utils/database.js');
      const roles = await getApplicationRoles(client, interaction.guildId);
      const query = String(focusedOption.value || '').toLowerCase();
      const choices = roles
        .filter((role) => interaction.commandName !== 'apply' || role.enabled !== false)
        .filter((role) => role.name.toLowerCase().startsWith(query))
        .slice(0, 25)
        .map((role) => ({ name: role.name, value: role.name }));
      await interaction.respond(choices);
    } catch (error) {
      logger.error('Error handling application autocomplete:', error);
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  await interaction.respond([]).catch(() => {});
}

function withTraceContext(context = {}, traceContext = {}) {
  return {
    traceId: traceContext.traceId,
    guildId: context.guildId || traceContext.guildId,
    userId: context.userId || traceContext.userId,
    command: context.commandName || traceContext.command,
    ...context
  };
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    const interactionTraceContext = createInteractionTraceContext(interaction);
    interaction.traceContext = interactionTraceContext;
    interaction.traceId = interactionTraceContext.traceId;

    return runWithTraceContext(interactionTraceContext, async () => {
      try {
        InteractionHelper.patchInteractionResponses(interaction);
        ResponseCoordinator.attach(interaction);

        if (interaction.isChatInputCommand()) {
          try {
            logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`, {
              event: 'interaction.command.received',
              traceId: interactionTraceContext.traceId,
              guildId: interaction.guildId,
              userId: interaction.user?.id,
              command: interaction.commandName,
            });
            await executeChatInputCommand(interaction, client, interactionTraceContext);
          } catch (error) {
            await handleInteractionError(interaction, error, withTraceContext({
              type: 'command',
              commandName: interaction.commandName,
            }, interactionTraceContext));
          }
          return;
        }

        if (interaction.isAutocomplete()) {
          try {
            await handleAutocomplete(interaction, client);
          } catch (error) {
            logger.error('Error handling command autocomplete:', {
              error: error.message,
              guildId: interaction.guildId,
              commandName: interaction.commandName,
            });
            await interaction.respond([]).catch(() => {});
          }
          return;
        }

        if (interaction.isButton()) {
          if (interaction.customId.startsWith('shared_todo_')) {
            const parts = interaction.customId.split('_');
            const buttonType = parts.slice(0, 3).join('_');
            const listId = parts[3];
            const button = client.buttons.get(buttonType);

            if (button) {
              try {
                await button.execute(interaction, client, [listId]);
              } catch (error) {
                await handleInteractionError(interaction, error, withTraceContext({
                  type: 'button',
                  customId: interaction.customId,
                  handler: 'todo'
                }, interactionTraceContext));
              }
            } else {
              throw createError(
                `No button handler found for ${buttonType}`,
                ErrorTypes.CONFIGURATION,
                'This button is not available.',
                withTraceContext({ buttonType }, interactionTraceContext)
              );
            }
            return;
          }

          const [customId, ...args] = interaction.customId.split(':');
          const button = client.buttons.get(customId);

          if (!button) {
            if (!interaction.customId.includes(':') || isCollectorManagedComponent(customId)) {
              return;
            }

            throw createError(
              `No button handler found for ${customId}`,
              ErrorTypes.CONFIGURATION,
              'This button is not available.',
              withTraceContext({ customId }, interactionTraceContext)
            );
          }

          try {
            await button.execute(interaction, client, args);
          } catch (error) {
            await handleInteractionError(interaction, error, withTraceContext({
              type: 'button',
              customId: interaction.customId,
              handler: 'general'
            }, interactionTraceContext));
          }
        } else if (interaction.isStringSelectMenu()) {
          const [customId, ...args] = interaction.customId.split(':');
          const selectMenu = client.selectMenus.get(customId);

          if (!selectMenu) {
            if (!interaction.customId.includes(':') || isCollectorManagedComponent(customId)) {
              return;
            }

            throw createError(
              `No select menu handler found for ${customId}`,
              ErrorTypes.CONFIGURATION,
              'This select menu is not available.',
              withTraceContext({ customId }, interactionTraceContext)
            );
          }

          try {
            await selectMenu.execute(interaction, client, args);
          } catch (error) {
            await handleInteractionError(interaction, error, withTraceContext({
              type: 'select_menu',
              customId: interaction.customId
            }, interactionTraceContext));
          }
        } else if (interaction.isModalSubmit()) {
          if (interaction.customId.startsWith('app_modal_')) {
            try {
              await handleApplicationModal(interaction);
            } catch (error) {
              await handleInteractionError(interaction, error, withTraceContext({
                type: 'modal',
                customId: interaction.customId,
                handler: 'application'
              }, interactionTraceContext));
            }
            return;
          }

          if (
            interaction.customId.startsWith('app_review_')
            || interaction.customId.startsWith('jtc_')
            || interaction.customId.startsWith('config_wizard_modal:')
            || interaction.customId.startsWith('log_dash_channel_modal:')
            || interaction.customId.startsWith('log_dash_filter_modal:')
          ) {
            logger.debug(`Skipping modal handler lookup for inline-awaited modal: ${interaction.customId}`, {
              event: 'interaction.modal.inline_skipped',
              traceId: interactionTraceContext.traceId
            });
            return;
          }

          const [customId, ...args] = interaction.customId.split(':');
          const modal = client.modals.get(customId);

          if (!modal) {
            if (!interaction.customId.includes(':')) {

              return;
            }

            throw createError(
              `No modal handler found for ${customId}`,
              ErrorTypes.CONFIGURATION,
              'This form is not available.',
              withTraceContext({ customId }, interactionTraceContext)
            );
          }

          try {
            await modal.execute(interaction, client, args);
          } catch (error) {
            await handleInteractionError(interaction, error, withTraceContext({
              type: 'modal',
              customId: interaction.customId,
              handler: 'general'
            }, interactionTraceContext));
          }
        }
      } catch (error) {
        logger.error('Unhandled error in interactionCreate:', {
          event: 'interaction.unhandled_error',
          errorCode: ErrorCodes.INTERACTION_UNHANDLED,
          error,
          traceId: interactionTraceContext.traceId,
          interactionId: interaction.id,
          guildId: interaction.guildId,
          userId: interaction.user?.id
        });

        try {
          await handleInteractionError(interaction, error, withTraceContext({
            type: 'interaction',
            commandName: interaction.commandName,
            customId: interaction.customId,
            source: 'interactionCreate.unhandled'
          }, interactionTraceContext));
        } catch (replyError) {
          logger.error('Failed to send fallback error response:', {
            event: 'interaction.error_response_failed',
            errorCode: ErrorCodes.INTERACTION_RESPONSE_FAILED,
            error: replyError,
            traceId: interactionTraceContext.traceId
          });
        }
      }
    });
  }
};

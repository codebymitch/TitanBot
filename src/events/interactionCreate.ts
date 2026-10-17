import { Events, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, GuildTextBasedChannel, Interaction } from 'discord.js';
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
import { validateChatInputPayloadOrThrow } from '../utils/commandInputValidation.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { resolveSlashAccessKey } from '../utils/messageAdapter.js';
import { isCollectorManagedComponent } from '../utils/collectorComponents.js';
import { ResponseCoordinator } from '../utils/responseCoordinator.js';
import { enforceDefaultCommandPermissions } from '../utils/permissionGuard.js';
import type { ErrorContext, ErrorLike } from '../utils/errorHandler.js';
import type { InteractionExtras, NexoInteraction } from '../utils/interactionHelper.js';
import type { TraceContext } from '../utils/logger.js';
import type { ReactionRoleMessage } from '../services/reactionRoleService.js';
import type { BotEvent, Command, GuildConfig, ResolvedRoute } from '../types/index.js';

/** Error context plus the identifiers withTraceContext folds into the trace fields. */
type TraceableContext = ErrorContext & { commandName?: string; guildId?: string | null; userId?: string | null };

/** Any interaction viewed with the optional identifiers read in the unhandled-error path. */
type UnhandledInteractionView = Interaction & { commandName?: string; customId?: string };

const COMMAND_ERROR_SUBTYPES: Record<string, string> = {
  warn: 'warn_failed',
  kick: 'kick_failed',
  ban: 'ban_failed',
  unban: 'unban_failed',
  timeout: 'timeout_failed',
  untimeout: 'untimeout_failed',
  warnings: 'warnings_view_failed',
  ticket: 'ticket_failed',
  serverstats: 'serverstats_failed',
  gcreate: 'giveaway_failed',
  gend: 'giveaway_failed',
  gdelete: 'giveaway_failed',
  greroll: 'giveaway_failed',
};

/** For consolidated router commands: the old command behind the invoked subcommand. */
function resolveCommandRoute(command: Command | undefined, interaction: ChatInputCommandInteraction): ResolvedRoute | null {
  return command?.resolveRoute?.(
    interaction.options.getSubcommandGroup(false),
    interaction.options.getSubcommand(false),
  ) ?? null;
}

function withTraceContext(context: TraceableContext = {}, traceContext: Partial<TraceContext> = {}): ErrorContext {
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
    (interaction as Interaction & InteractionExtras).traceContext = interactionTraceContext;
    (interaction as Interaction & InteractionExtras).traceId = interactionTraceContext.traceId;

    return runWithTraceContext(interactionTraceContext, async () => {
      try {
        InteractionHelper.patchInteractionResponses(interaction as NexoInteraction);
        ResponseCoordinator.attach(interaction as NexoInteraction);

        if (interaction.isChatInputCommand()) {
          try {
            logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`, {
              event: 'interaction.command.received',
              traceId: interactionTraceContext.traceId,
              guildId: interaction.guildId,
              userId: interaction.user?.id,
              command: interaction.commandName
            });

            validateChatInputPayloadOrThrow(interaction, withTraceContext({
              type: 'command_input_validation',
              commandName: interaction.commandName
            }, interactionTraceContext));

            const command = client.commands.get(interaction.commandName);

            if (!command) {
              throw createError(
                `No command matching ${interaction.commandName} was found.`,
                ErrorTypes.CONFIGURATION,
                'Diesen Command gibt es leider nicht.',
                withTraceContext({ commandName: interaction.commandName }, interactionTraceContext)
              );
            }

            if (isMaintenanceMode() && !isBotOwner(interaction.user.id)) {
              throw createError(
                'Bot is in maintenance mode',
                ErrorTypes.CONFIGURATION,
                getBotMessage('maintenanceMode'),
                withTraceContext({ commandName: interaction.commandName }, interactionTraceContext)
              );
            }

            const route = resolveCommandRoute(command, interaction);
            // Bucket name for cooldowns and abuse protection: the old command name, so limits stay per old command.
            const protectionName = route?.legacyName ?? interaction.commandName;

            if (!isCommandCategoryEnabled(command.category) || (route && !isCommandCategoryEnabled(route.category))) {
              throw createError(
                `Feature disabled for category ${command.category}`,
                ErrorTypes.CONFIGURATION,
                getBotMessage('commandDisabled'),
                withTraceContext({ commandName: interaction.commandName, category: command.category }, interactionTraceContext)
              );
            }

            const defaultCooldownSec = Number(botConfig.commands?.defaultCooldown) || 0;
            if (defaultCooldownSec > 0 && !isBotOwner(interaction.user.id)) {
              const cooldownKey = `${interaction.user.id}:${protectionName}`;
              const expiresAt = client.cooldowns.get(cooldownKey);

              if (expiresAt && Date.now() < expiresAt) {
                const remainingSec = Math.ceil((expiresAt - Date.now()) / 1000);
                throw createError(
                  `Default command cooldown active for ${interaction.commandName}`,
                  ErrorTypes.RATE_LIMIT,
                  getBotMessage('cooldownActive', { time: `${remainingSec}s` }),
                  withTraceContext({ commandName: interaction.commandName, remainingSec }, interactionTraceContext)
                );
              }

              client.cooldowns.set(cooldownKey, Date.now() + defaultCooldownSec * 1000);
            }

            const abuseProtection = await enforceAbuseProtection(
              interaction,
              route ? { category: route.category, abuseProtection: route.module.abuseProtection } : command,
              protectionName,
            );
            if (!abuseProtection.allowed) {
              const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
              throw createError(
                `Risky command cooldown active for ${interaction.commandName}`,
                ErrorTypes.RATE_LIMIT,
                `Dieser Command hat gerade Cooldown. Bitte warte ${formattedCooldown}, bevor du es erneut versuchst.`,
                withTraceContext({
                  commandName: interaction.commandName,
                  subtype: 'command_cooldown',
                  expected: true,
                  cooldownMs: abuseProtection.remainingMs,
                  cooldownWindowMs: abuseProtection.policy?.windowMs,
                  cooldownMaxAttempts: abuseProtection.policy?.maxAttempts
                }, interactionTraceContext)
              );
            }

            let guildConfig: GuildConfig | null = null;
            if (interaction.guild) {
              guildConfig = await getGuildConfig(client, interaction.guild.id, { ...interactionTraceContext });
              const accessKey = resolveSlashAccessKey(interaction);
              if (!(await isCommandEnabled(client, interaction.guild.id, accessKey, command.category))) {
                throw createError(
                  `Command ${accessKey} is disabled in this guild`,
                  ErrorTypes.CONFIGURATION,
                  'Dieser Command wurde für diesen Server deaktiviert.',
                  withTraceContext({ commandName: accessKey, guildId: interaction.guild.id }, interactionTraceContext)
                );
              }
            }

            const permissionAllowed = await enforceDefaultCommandPermissions(interaction, command, {
              source: 'interactionCreate',
              guildConfig,
            });
            if (!permissionAllowed) {
              return;
            }

            await command.execute(interaction, guildConfig, client);
          } catch (error) {
            await handleInteractionError(interaction, error, withTraceContext({
              type: 'command',
              commandName: interaction.commandName,
              subtype: COMMAND_ERROR_SUBTYPES[resolveCommandRoute(client.commands.get(interaction.commandName), interaction)?.legacyName ?? interaction.commandName] || (error as ErrorLike | null | undefined)?.context?.subtype,
            }, interactionTraceContext));
          }
        } else if (interaction.isAutocomplete()) {
          const autocompleteCommand = client.commands.get(interaction.commandName);
          if (autocompleteCommand?.autocomplete) {
            try {
              await autocompleteCommand.autocomplete(interaction, client);
            } catch (error) {
              logger.error('Error handling command autocomplete:', {
                error: (error as ErrorLike).message,
                guildId: interaction.guildId,
                commandName: interaction.commandName,
              });
              await interaction.respond([]).catch(() => {});
            }
            return;
          }

          const focusedOption = interaction.options.getFocused(true);
          
          if (interaction.commandName === 'apply' && focusedOption.name === 'application') {
            try {
              const { getApplicationRoles } = await import('../utils/database.js');
              const roles = await getApplicationRoles(client, interaction.guildId!);
              const roleName = interaction.options.getString('application', false);

              const filtered = roles.filter(role =>
                role.enabled !== false && 
                role.name.toLowerCase().startsWith(roleName?.toLowerCase() || '')
              );
              
              await interaction.respond(
                filtered.slice(0, 25).map(role => ({
                  name: `${role.name}${role.enabled === false ? ' (deaktiviert)' : ''}`,
                  value: role.name
                }))
              );
            } catch (error) {
              logger.error('Error handling autocomplete:', {
                error: (error as ErrorLike).message,
                guildId: interaction.guildId,
                commandName: interaction.commandName
              });
              await interaction.respond([]);
            }
          } else if (interaction.commandName === 'app-admin' && focusedOption.name === 'application') {
            try {
              const { getApplicationRoles } = await import('../utils/database.js');
              const roles = await getApplicationRoles(client, interaction.guildId!);
              const appName = interaction.options.getString('application', false);

              const filtered = roles.filter(role =>
                role.name.toLowerCase().startsWith(appName?.toLowerCase() || '')
              );
              
              await interaction.respond(
                filtered.slice(0, 25).map(role => ({
                  name: `${role.name}${role.enabled === false ? ' (deaktiviert)' : ''}`,
                  value: role.name
                }))
              );
            } catch (error) {
              logger.error('Error handling app-admin autocomplete:', {
                error: (error as ErrorLike).message,
                guildId: interaction.guildId,
                commandName: interaction.commandName
              });
              await interaction.respond([]);
            }
          } else if (interaction.commandName === 'reactroles' && focusedOption.name === 'panel') {
            try {
              const { getAllReactionRoleMessages, deleteReactionRoleMessage } = await import('../services/reactionRoleService.js');
              const guildId = interaction.guildId!;
              const guild = interaction.guild!;
              
              let panels = await getAllReactionRoleMessages(client, guildId);
              
              if (!panels || panels.length === 0) {
                await interaction.respond([]);
                return;
              }

              const validPanels: ReactionRoleMessage[] = [];
              for (const panel of panels) {
                if (!panel.messageId || !panel.channelId) {
                  continue;
                }
                
                const channel = guild.channels.cache.get(panel.channelId) as GuildTextBasedChannel | undefined;
                if (!channel) {
                  await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
                  continue;
                }
                
                const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
                if (!msg) {
                  await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
                  continue;
                }
                validPanels.push(panel);
              }
              
              if (validPanels.length === 0) {
                await interaction.respond([]);
                return;
              }
              
              const choices = await Promise.all(
                validPanels.slice(0, 25).map(async panel => {
                  try {
                    const channel = guild.channels.cache.get(panel.channelId) as GuildTextBasedChannel | undefined;
                    if (!channel) return null;
                    
                    const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
                    if (!msg) return null;
                    
                    const title = msg?.embeds?.[0]?.title ?? 'Panel ohne Titel';
                    const channelName = channel?.name ?? 'unbekannt';
                    
                    return {
                      name: `${title} (${channelName})`.substring(0, 100),
                      value: panel.messageId
                    };
                  } catch (e) {
                    return null;
                  }
                })
              );
              
              const validChoices = choices.filter(c => c !== null);
              await interaction.respond(validChoices);
            } catch (error) {
              logger.error('Error handling reactroles autocomplete:', {
                error: (error as ErrorLike).message,
                guildId: interaction.guildId,
                commandName: interaction.commandName
              });
              await interaction.respond([]);
            }
          }
        } else if (interaction.isButton()) {
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
                'Dieser Button ist nicht verfügbar.',
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
              'Dieser Button ist nicht verfügbar.',
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
              'Dieses Auswahlmenü ist nicht verfügbar.',
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
              'Dieses Formular ist nicht verfügbar.',
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
          await handleInteractionError(interaction as NexoInteraction, error, withTraceContext({
            type: 'interaction',
            commandName: (interaction as UnhandledInteractionView).commandName,
            customId: (interaction as UnhandledInteractionView).customId,
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
} satisfies BotEvent<Events.InteractionCreate>;
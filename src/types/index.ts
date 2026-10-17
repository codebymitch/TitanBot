import type { Server } from 'node:http';
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ClientEvents,
  Collection,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { Riffy } from 'riffy';
import type { z } from 'zod';
import type appConfig from '../config/application.js';
import type { db } from '../utils/database/wrapper.js';
import type { GuildConfigSchema } from '../utils/schemas.js';

/** The bot client once it is logged in. All handlers run after `ready`. */
export type NexoClient = Client<true>;

export type AppConfig = typeof appConfig;
export type DatabaseWrapper = typeof db;

/** Guild config keys that are stored but not part of the zod schema (passthrough). */
export interface GuildConfigExtras {
  enabledCommands?: Record<string, boolean>;
  setupWizardCompleted?: boolean;
  birthdayRoleId?: string | null;
  ticketPanelChannelId?: string | null;
  ticketPanelMessageId?: string | null;
  ticketPanelMessage?: string | null;
  ticketButtonLabel?: string | null;
  ticketStaffRoleId?: string | null;
  ticketCategoryId?: string | null;
  ticketClosedCategoryId?: string | null;
  ticketLogsChannelId?: string | null;
  ticketTranscriptChannelId?: string | null;
  maxTicketsPerUser?: number;
  tickets?: { enablePriority?: boolean };
}

/** Stored per-guild configuration (passthrough: unknown keys are kept). */
export type GuildConfig = NonNullable<z.infer<typeof GuildConfigSchema>> & GuildConfigExtras;

/** Anything that serializes to a chat-input command (all SlashCommandBuilder variants). */
export interface CommandData {
  readonly name: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface AbuseProtectionPolicy {
  enabled?: boolean;
  maxAttempts?: number;
  windowMs?: number;
  anomaly?: { threshold?: number; windowMs?: number };
}

export interface Command {
  data: CommandData;
  execute(
    interaction: ChatInputCommandInteraction,
    guildConfig: GuildConfig | null,
    client: NexoClient,
  ): Promise<unknown>;
  /** Optional dedicated handler for prefix (message) invocations. */
  prefixExecute?(
    interaction: ChatInputCommandInteraction,
    guildConfig: GuildConfig | null,
    client: NexoClient,
  ): Promise<unknown>;
  autocomplete?(interaction: AutocompleteInteraction, client: NexoClient): Promise<unknown>;
  slashOnly?: boolean;
  prefixOnly?: boolean;
  abuseProtection?: AbuseProtectionPolicy;
  /** Router commands (consolidated commands): the old command a subcommand path maps to. */
  resolveRoute?(group: string | null, subcommand: string | null): ResolvedRoute | null;
  /** Set by the command loader. */
  category?: string;
  /** Set by the command loader. */
  filePath?: string;
}

/** Result of `Command.resolveRoute`: the pre-consolidation command behind a router subcommand. */
export interface ResolvedRoute {
  /** Old top-level command name (cooldown buckets, error subtypes, access checks). */
  legacyName: string;
  /** Category folder of the old command. */
  category: string;
  module: Command;
}

/** A subcommand implementation called by a router command. */
export interface SubcommandModule {
  prefixOnly?: boolean;
  execute(
    interaction: ChatInputCommandInteraction,
    guildConfig: GuildConfig | null,
    client: NexoClient,
  ): Promise<unknown>;
}

export type EventName = keyof ClientEvents;

export interface BotEvent<K extends EventName = EventName> {
  name: K;
  once?: boolean;
  execute(...args: [...ClientEvents[K], NexoClient]): unknown;
}

export interface ComponentHandler<I> {
  name: string;
  execute(interaction: I, client: NexoClient, args: string[]): Promise<unknown>;
}

export type ButtonHandler = ComponentHandler<ButtonInteraction>;
export type SelectMenuHandler = ComponentHandler<StringSelectMenuInteraction>;
export type ModalHandler = ComponentHandler<ModalSubmitInteraction>;

declare module 'discord.js' {
  interface Client {
    config: AppConfig;
    commands: Collection<string, Command>;
    buttons: Collection<string, ButtonHandler>;
    selectMenus: Collection<string, SelectMenuHandler>;
    modals: Collection<string, ModalHandler>;
    cooldowns: Collection<string, number>;
    db: DatabaseWrapper;
    riffy?: Riffy;
    webServer?: Server;
  }
}

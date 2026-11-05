import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;
const REMOVED_CATEGORIES = new Set(['economy', 'fun', 'music', 'jointocreate']);
const REMOVED_COMMANDS = new Set(['jointocreate']);

function getSubcommandInfo(commandData) {
  const subcommands = [];
  for (const option of commandData.options || []) {
    if (option.type === 1) subcommands.push(option.name);
    else if (option.type === 2) {
      for (const nested of option.options || []) if (nested.type === 1) subcommands.push(`${option.name}/${nested.name}`);
    }
  }
  return subcommands;
}

async function getAllFiles(directory, fileList = []) {
  const files = await fs.readdir(directory, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(directory, file.name);
    if (file.isDirectory()) {
      if (file.name !== 'modules') await getAllFiles(filePath, fileList);
    } else if (file.name.endsWith('.js')) fileList.push(filePath);
  }
  return fileList;
}

export async function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, '../../commands');
  const commandFiles = await getAllFiles(commandsPath);
  const uniqueCommandNames = new Set();

  for (const filePath of commandFiles) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const category = path.basename(path.dirname(filePath));
    const commandName = path.basename(filePath, '.js').toLowerCase();
    if (REMOVED_CATEGORIES.has(category.toLowerCase()) || REMOVED_COMMANDS.has(commandName)) continue;

    try {
      const module = await import(pathToFileURL(filePath).href);
      const command = module.default || module;
      if (!command.data || !command.execute) {
        logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
        continue;
      }
      command.category = category;
      command.filePath = normalizedPath;
      const primaryName = command.data.name;
      if (uniqueCommandNames.has(primaryName)) continue;
      uniqueCommandNames.add(primaryName);
      client.commands.set(primaryName, command);
      const subcommands = getSubcommandInfo(command.data.toJSON());
      logger.info(`Loaded command: ${primaryName} from ${normalizedPath} (category: ${category})`);
      if (subcommands.length) logger.info(`  - Subcommands: ${subcommands.join(', ')}`);
    } catch (error) {
      logger.error(`Error loading command from ${filePath}:`, error);
    }
  }

  logger.info(`Loaded ${client.commands.size} commands`);
  return client.commands;
}

function collectCommandPayloads(client) {
  const commands = [];
  let totalSubcommands = 0;
  for (const command of client.commands.values()) {
    if (!command.data || typeof command.data.toJSON !== 'function') continue;
    const payload = command.data.toJSON();
    commands.push(payload);
    totalSubcommands += getSubcommandInfo(payload).length;
  }
  return { commands, totalSubcommands };
}

function validateCommands(commands) {
  for (const cmd of commands) {
    if (cmd.name?.length > 32) throw new Error(`Command ${cmd.name} has a name longer than 32 characters`);
    if (cmd.description?.length > 110) throw new Error(`Command ${cmd.name} has a description longer than 110 characters`);
  }
}

function prepareCommandsForRegistration(commands) {
  if (commands.length >= COMMAND_COUNT_WARN_THRESHOLD) logger.warn(`Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} global command limit`);
  return commands.slice(0, MAX_COMMANDS);
}

async function registerGlobalCommands(client, clientId, commands, totalSubcommands) {
  if (!clientId) throw new Error('CLIENT_ID is required for slash command registration');
  if (!client.rest) throw new Error('Discord REST client is not available for slash command registration');
  logger.info(`Preparing to register ${totalSubcommands + commands.length} commands globally`);
  validateCommands(commands);
  const commandsToRegister = prepareCommandsForRegistration(commands);
  // Discord's bulk overwrite removes stale commands that are no longer loaded.
  await client.rest.put(`/applications/${clientId}/commands`, { body: commandsToRegister });
  logger.info(`Successfully registered ${commandsToRegister.length} global commands`);
}

export async function registerCommands(client, options = {}) {
  const { commands, totalSubcommands } = collectCommandPayloads(client);
  await registerGlobalCommands(client, options.clientId, commands, totalSubcommands);
}

export async function reloadCommand(client, commandName) {
  const command = client.commands.get(commandName);
  if (!command) return { success: false, message: `Command "${commandName}" not found` };
  try {
    const moduleUrl = pathToFileURL(path.resolve(command.filePath));
    moduleUrl.searchParams.set('t', Date.now().toString());
    const newCommand = (await import(moduleUrl.href)).default;
    client.commands.set(commandName, newCommand);
    return { success: true, message: `Successfully reloaded command "${commandName}"` };
  } catch (error) {
    logger.error(`Error reloading command "${commandName}":`, error);
    return { success: false, message: `Error reloading command: ${error.message}` };
  }
}

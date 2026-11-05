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
  const result = [];
  for (const option of commandData.options || []) {
    if (option.type === 1) result.push(option.name);
    else if (option.type === 2) {
      for (const nested of option.options || []) if (nested.type === 1) result.push(`${option.name}/${nested.name}`);
    }
  }
  return result;
}

async function getAllFiles(directory, files = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'modules') await getAllFiles(fullPath, files);
    } else if (entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

export async function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, '../../commands');
  const files = await getAllFiles(commandsPath);
  const names = new Set();

  for (const filePath of files) {
    const category = path.basename(path.dirname(filePath));
    const fileName = path.basename(filePath, '.js').toLowerCase();
    if (REMOVED_CATEGORIES.has(category.toLowerCase()) || REMOVED_COMMANDS.has(fileName)) continue;

    try {
      const module = await import(pathToFileURL(filePath).href);
      const command = module.default || module;
      if (!command.data || !command.execute) {
        logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
        continue;
      }
      command.category = category;
      command.filePath = filePath.replace(/\\/g, '/');
      const name = command.data.name;
      if (names.has(name)) continue;
      names.add(name);
      client.commands.set(name, command);
      const subcommands = getSubcommandInfo(command.data.toJSON());
      logger.info(`Loaded command: ${name} (category: ${category})`);
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
    const data = command.data.toJSON();
    commands.push(data);
    totalSubcommands += getSubcommandInfo(data).length;
  }
  return { commands, totalSubcommands };
}

function validateCommands(commands) {
  for (const command of commands) {
    if (command.name?.length > 32) throw new Error(`Command ${command.name} has name longer than 32 characters`);
    if (command.description?.length > 110) throw new Error(`Command ${command.name} has description longer than 110 characters`);
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
  const body = prepareCommandsForRegistration(commands);
  // Discord bulk-overwrite removes stale slash commands that are no longer loaded.
  await client.rest.put(`/applications/${clientId}/commands`, { body });
  logger.info(`Successfully registered ${body.length} global commands`);
}

export async function registerCommands(client, options = {}) {
  const { commands, totalSubcommands } = collectCommandPayloads(client);
  await registerGlobalCommands(client, options.clientId, commands, totalSubcommands);
}

export async function reloadCommand(client, commandName) {
  const command = client.commands.get(commandName);
  if (!command) return { success: false, message: `Command "${commandName}" not found` };
  try {
    const url = pathToFileURL(path.resolve(command.filePath));
    url.searchParams.set('t', Date.now().toString());
    client.commands.set(commandName, (await import(url.href)).default);
    return { success: true, message: `Successfully reloaded command "${commandName}"` };
  } catch (error) {
    logger.error(`Error reloading command "${commandName}":`, error);
    return { success: false, message: `Error reloading command: ${error.message}` };
  }
}

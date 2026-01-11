import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively loads all command files from the specified directory
 * @param {string} directory - Directory to load commands from
 * @param {string[]} fileList - List of file paths (used for recursion)
 * @returns {Promise<string[]>} - Array of file paths
 */
async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        
        if (file.isDirectory()) {
            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) {
            fileList.push(filePath);
        }
    }
    
    return fileList;
}

/**
 * Loads all commands from the commands directory
 * @param {import('discord.js').Client} client - Discord.js client
 * @returns {Promise<Collection<string, object>>} - Collection of commands
 */
export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../src/commands');
    const commandFiles = await getAllFiles(commandsPath);
    
    for (const filePath of commandFiles) {
        try {
            // Convert Windows paths to forward slashes for consistency
            const normalizedPath = filePath.replace(/\\/g, '/');
            
            // Get the command name from the file path
            const commandName = path.basename(filePath, '.js');
            const commandDir = path.dirname(filePath);
            const category = path.basename(commandDir);
            
            // Import the command module
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default || commandModule;
            
            if (!command.data || !command.execute) {
                logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
                continue;
            }
            
            // Add category and file path to command for reference
            command.category = category;
            command.filePath = normalizedPath;
            
            // Add the command to the collection with the command name as the key
            client.commands.set(command.data.name, command);
            
            logger.debug(`Loaded command: ${category}/${commandName}`);
            
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }
    
    logger.info(`Successfully loaded ${client.commands.size} commands`);
    return client.commands;
}

/**
 * Registers all slash commands with Discord
 * @param {import('discord.js').Client} client - Discord.js client
 * @param {string} [guildId] - Optional guild ID to register commands for a specific guild
 * @returns {Promise<void>}
 */
export async function registerCommands(client, guildId) {
    try {
        const commands = [];
        
        // Convert commands to JSON for registration
        for (const command of client.commands.values()) {
            // Skip commands that shouldn't be registered (e.g., context menus)
            if (command.data && typeof command.data.toJSON === 'function') {
                commands.push(command.data.toJSON());
            }
        }
        
        if (guildId) {
            // Register commands for a specific guild (faster for development)
            const guild = await client.guilds.fetch(guildId);
            await guild.commands.set(commands);
            logger.info(`Registered ${commands.length} commands for guild ${guild.name}`);
        } else {
            // Register commands globally
            await client.application.commands.set(commands);
            logger.info(`Registered ${commands.length} commands globally`);
        }
    } catch (error) {
        logger.error('Error registering commands:', error);
        throw error;
    }
}

/**
 * Reloads a specific command
 * @param {import('discord.js').Client} client - Discord.js client
 * @param {string} commandName - Name of the command to reload
 * @returns {Promise<{success: boolean, message: string}>} - Result of the reload operation
 */
export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);
    
    if (!command) {
        return { success: false, message: `Command "${commandName}" not found` };
    }
    
    try {
        // Delete the cached module
        const commandPath = path.resolve(command.filePath);
        delete require.cache[require.resolve(commandPath)];
        
        // Re-import the command
        const newCommand = (await import(`file://${commandPath}`)).default;
        
        // Update the command in the collection
        client.commands.set(commandName, newCommand);
        
        logger.info(`Reloaded command: ${commandName}`);
        return { success: true, message: `Successfully reloaded command "${commandName}"` };
    } catch (error) {
        logger.error(`Error reloading command "${commandName}":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}

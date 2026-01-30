import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extracts subcommand information from a SlashCommandBuilder
 * @param {SlashCommandBuilder} commandData - The command data object
 * @returns {string[]} - Array of subcommand names
 */
function getSubcommandInfo(commandData) {
    const subcommands = [];
    
    if (commandData.options) {
        for (const option of commandData.options) {
            if (option.type === 1) { // SUB_COMMAND type
                subcommands.push(option.name);
            } else if (option.type === 2) { // SUB_COMMAND_GROUP type
                if (option.options) {
                    for (const subOption of option.options) {
                        if (subOption.type === 1) { // SUB_COMMAND type within group
                            subcommands.push(`${option.name}/${subOption.name}`);
                        }
                    }
                }
            }
        }
    }
    
    return subcommands;
}

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
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = await getAllFiles(commandsPath);
    
    logger.info(`Found ${commandFiles.length} command files to load`);
    
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
            
            // Register aliases for prefix commands (economy commands)
            if (command.aliases && command.category === 'Economy') {
                for (const alias of command.aliases) {
                    client.commands.set(alias, command);
                }
            }
            
            // Also register by name for prefix commands
            if (command.name && command.category === 'Economy') {
                client.commands.set(command.name, command);
            }
            
            // Log command with subcommand details
            const subcommands = getSubcommandInfo(command.data.toJSON());
            
            if (subcommands.length > 0) {
                logger.info(`Loaded command: ${command.data.name} with subcommands: ${subcommands.join(', ')}`);
            } else {
                logger.debug(`Loaded command: ${command.data.name}`);
            }
            
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }
    
    // Log summary of commands with subcommands
    const commandsWithSubcommands = Array.from(client.commands.values()).filter(cmd => {
        const subcommands = getSubcommandInfo(cmd.data.toJSON());
        return subcommands.length > 0;
    });
    
    const totalSubcommands = commandsWithSubcommands.reduce((total, cmd) => {
        return total + getSubcommandInfo(cmd.data.toJSON()).length;
    }, 0);
    
    // Calculate total commands including subcommands as individual commands
    const baseCommands = client.commands.size;
    const totalCommandsWithSubs = baseCommands + totalSubcommands;
    
    logger.info(`Successfully loaded ${totalCommandsWithSubs} commands (${commandsWithSubcommands.length} with subcommands, ${totalSubcommands} total subcommands)`);
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
        let totalSubcommands = 0;
        
        // Convert commands to JSON for registration
        for (const command of client.commands.values()) {
            // Skip commands that shouldn't be registered (e.g., context menus)
            if (command.data && typeof command.data.toJSON === 'function') {
                commands.push(command.data.toJSON());
                
                // Count subcommands for this command
                const subcommands = getSubcommandInfo(command.data.toJSON());
                totalSubcommands += subcommands.length;
            }
        }
        
        // Calculate total commands including subcommands
        const totalCommandsWithSubs = commands.length + totalSubcommands;
        
        if (guildId) {
            // Register commands for a specific guild (faster for development)
            const guild = await client.guilds.fetch(guildId);
            await guild.commands.set(commands);
            logger.info(`Registered ${totalCommandsWithSubs} guild commands`);
        } else {
            // Register commands globally
            await client.application.commands.set(commands);
            logger.info(`Registered ${totalCommandsWithSubs} global commands`);
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

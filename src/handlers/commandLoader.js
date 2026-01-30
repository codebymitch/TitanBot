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
            
            // Get the primary command name from the command data
            const primaryCommandName = command.data.name;
            
            console.log(`Processing command: ${primaryCommandName} from ${filePath}`);
            
            // Only add the command if it hasn't been added before (prevent duplicates)
            if (!client.commands.has(primaryCommandName)) {
                console.log(`Adding new command: ${primaryCommandName}`);
                // Add the command to the collection with the command name as the key
                client.commands.set(primaryCommandName, command);
                
                // Register aliases for prefix commands (economy commands) - but ONLY for prefix commands
                if (command.aliases && command.category === 'Economy') {
                    console.log(`Adding aliases for ${primaryCommandName}: ${command.aliases.join(', ')}`);
                    for (const alias of command.aliases) {
                        // Don't override existing commands with aliases
                        if (!client.commands.has(alias)) {
                            client.commands.set(alias, command);
                        } else {
                            console.log(`Skipping alias ${alias} - already exists`);
                        }
                    }
                }
                
                // Also register by name for prefix commands (economy commands)
                if (command.name && command.category === 'Economy' && !client.commands.has(command.name)) {
                    console.log(`Adding prefix name: ${command.name} for command ${primaryCommandName}`);
                    client.commands.set(command.name, command);
                } else if (command.name && command.category === 'Economy') {
                    console.log(`Skipping prefix name ${command.name} - already exists`);
                }
            } else {
                console.log(`Skipping duplicate command: ${primaryCommandName}`);
            }
            
            // Log command with subcommand details
            const subcommands = getSubcommandInfo(command.data.toJSON());
            
            if (subcommands.length > 0) {
                logger.info(`Loaded command: ${primaryCommandName} with subcommands: ${subcommands.join(', ')}`);
            } else {
                logger.debug(`Loaded command: ${primaryCommandName}`);
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
    
    // Calculate total unique commands (excluding aliases)
    const uniqueCommands = new Set();
    for (const [name, command] of client.commands.entries()) {
        if (command.data && command.data.name) {
            uniqueCommands.add(command.data.name);
        }
    }
    
    logger.info(`Successfully loaded ${uniqueCommands.size} unique commands (${client.commands.size} total including aliases) (${commandsWithSubcommands.length} with subcommands, ${totalSubcommands} total subcommands)`);
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
        const registeredNames = new Set(); // Track unique command names
        
        console.log(`Starting command registration for ${client.commands.size} commands...`);
        
        // Convert commands to JSON for registration
        for (const command of client.commands.values()) {
            // Skip duplicates (only register by command name, not aliases)
            if (command.data && typeof command.data.toJSON === 'function') {
                const commandName = command.data.name;
                
                // Only register if we haven't seen this command name before
                if (!registeredNames.has(commandName)) {
                    registeredNames.add(commandName);
                    const commandJson = command.data.toJSON();
                    commands.push(commandJson);
                    
                    // Count subcommands for this command
                    const subcommands = getSubcommandInfo(commandJson);
                    totalSubcommands += subcommands.length;
                    
                    console.log(`Registering command: ${commandName}`);
                } else {
                    console.log(`Skipping duplicate command: ${commandName}`);
                }
            }
        }
        
        // Calculate total commands including subcommands
        const totalCommandsWithSubs = commands.length + totalSubcommands;
        
        console.log(`Attempting to register ${commands.length} unique base commands (${totalCommandsWithSubs} total with subcommands)`);
        
        if (guildId) {
            // Register commands for a specific guild (faster for development)
            console.log(`Registering commands for guild: ${guildId}`);
            
            // First, clear existing guild commands to prevent duplicates
            const guild = await client.guilds.fetch(guildId);
            const existingCommands = await guild.commands.fetch();
            console.log(`Found ${existingCommands.size} existing guild commands, clearing...`);
            
            if (existingCommands.size > 0) {
                await guild.commands.set([]);
                console.log('Cleared existing guild commands');
                // Wait a moment for Discord to process the clearing
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Now register the new commands
            await guild.commands.set(commands);
            console.log(`Successfully registered ${totalCommandsWithSubs} guild commands`);
            logger.info(`Registered ${totalCommandsWithSubs} guild commands`);
        } else {
            // Register commands globally
            console.log('Registering commands globally...');
            await client.application.commands.set(commands);
            console.log(`Successfully registered ${totalCommandsWithSubs} global commands`);
            logger.info(`Registered ${totalCommandsWithSubs} global commands`);
        }
    } catch (error) {
        console.error('Error registering commands:', error);
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

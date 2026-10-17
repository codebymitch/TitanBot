import fs from 'fs/promises';
import { isLoadableModuleFile } from '../../utils/helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApplicationCommandOptionType, Collection } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';
import type { Command, NexoClient } from '../../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;

type CommandJSON = RESTPostAPIChatInputApplicationCommandsJSONBody;

interface ValidatableChoice {
    name?: string;
    value?: string | number;
}

interface ValidatableOption {
    name?: string;
    description?: string;
    choices?: ValidatableChoice[];
    options?: ValidatableOption[];
}

interface ValidatableCommand {
    name?: string;
    description?: string;
    options?: ValidatableOption[];
}

function isCommand(value: unknown): value is Command {
    return typeof value === 'object' && value !== null
        && 'data' in value && Boolean(value.data)
        && 'execute' in value && Boolean(value.execute);
}

function getSubcommandInfo(commandData: CommandJSON): string[] {
    const subcommands: string[] = [];
    
    if (commandData.options) {
        for (const option of commandData.options) {
if (option.type === ApplicationCommandOptionType.Subcommand) {
                subcommands.push(option.name);
} else if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
                if (option.options) {
                    for (const subOption of option.options) {
if (subOption.type === ApplicationCommandOptionType.Subcommand) {
                            subcommands.push(`${option.name}/${subOption.name}`);
                        }
                    }
                }
            }
        }
    }
    
    return subcommands;
}

async function getAllFiles(directory: string, fileList: string[] = []): Promise<string[]> {
    const files = await fs.readdir(directory, { withFileTypes: true });
    
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        
        if (file.isDirectory()) {
            if (file.name === 'modules') {
                continue;
            }
            await getAllFiles(filePath, fileList);
        } else if (isLoadableModuleFile(file.name)) {
            fileList.push(filePath);
        }
    }
    
    return fileList;
}

export async function loadCommands(client: NexoClient): Promise<Collection<string, Command>> {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../../commands');
    const commandFiles = await getAllFiles(commandsPath);
    
    logger.info(`Found ${commandFiles.length} command files to load`);
    
    const uniqueCommandNames = new Set<string>();
    
    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            
            const commandName = path.parse(filePath).name;
            const commandDir = path.dirname(filePath);
            const category = path.basename(commandDir);
            
            const commandModule: { default?: unknown } = await import(`file://${filePath}`);
            const command: unknown = commandModule.default || commandModule;
            
            if (!isCommand(command)) {
                logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
                continue;
            }
            
            command.category = category;
            command.filePath = normalizedPath;
            
            const primaryCommandName = command.data.name;
            
            if (!uniqueCommandNames.has(primaryCommandName)) {
                uniqueCommandNames.add(primaryCommandName);
                
                client.commands.set(primaryCommandName, command);
            }
            
            const subcommands = getSubcommandInfo(command.data.toJSON());
            
            logger.info(`Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`);
            
            if (subcommands.length > 0) {
                logger.info(`  - Subcommands: ${subcommands.join(', ')}`);
            }
            
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }
    
    const commandsWithSubcommands = Array.from(client.commands.values()).filter(cmd => {
        const subcommands = getSubcommandInfo(cmd.data.toJSON());
        return subcommands.length > 0;
    });
    
    const totalSubcommands = commandsWithSubcommands.reduce((total, cmd) => {
        return total + getSubcommandInfo(cmd.data.toJSON()).length;
    }, 0);
    
    const uniqueCommands = new Set<string>();
    for (const [name, command] of client.commands.entries()) {
        if (command.data && command.data.name) {
            uniqueCommands.add(command.data.name);
        }
    }
    
    logger.info(`Loaded ${uniqueCommands.size} commands`);
    return client.commands;
}

function collectCommandPayloads(client: NexoClient): { commands: CommandJSON[]; totalSubcommands: number } {
    const commands: CommandJSON[] = [];
    let totalSubcommands = 0;
    const registeredNames = new Set<string>();

    for (const command of client.commands.values()) {
        if (!command.data || typeof command.data.toJSON !== 'function') {
            logger.warn(`Command missing data or toJSON method: ${command}`);
            continue;
        }

        const commandName = command.data.name;
        logger.debug(`Processing command for registration: ${commandName}`);

        if (registeredNames.has(commandName)) {
            logger.debug(`Skipping duplicate command: ${commandName}`);
            continue;
        }

        registeredNames.add(commandName);
        const commandJson = command.data.toJSON();
        commands.push(commandJson);
        totalSubcommands += getSubcommandInfo(commandJson).length;

        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`Registering command: ${commandName}`);
        }
    }

    return { commands, totalSubcommands };
}

function validateCommands(commands: ValidatableCommand[]): void {
    const validationErrors: string[] = [];

    for (const cmd of commands) {
        if (cmd.name && cmd.name.length > 32) {
            validationErrors.push(`Command ${cmd.name} has name longer than 32 chars: "${cmd.name}" (${cmd.name.length} chars)`);
        }
        if (cmd.description && cmd.description.length > 110) {
            validationErrors.push(`Command ${cmd.name} has description longer than 110 chars: "${cmd.description}" (${cmd.description.length} chars)`);
        }

        if (!cmd.options) {
            continue;
        }

        for (const option of cmd.options) {
            if (option.name && option.name.length > 32) {
                validationErrors.push(`Command ${cmd.name} option ${option.name} has name longer than 32 chars: "${option.name}" (${option.name.length} chars)`);
            }
            if (option.description && option.description.length > 110) {
                validationErrors.push(`Command ${cmd.name} option ${option.name} has description longer than 110 chars: "${option.description}" (${option.description.length} chars)`);
            }

            if (option.choices) {
                for (const choice of option.choices) {
                    if (choice.name && choice.name.length > 110) {
                        validationErrors.push(`Command ${cmd.name} option ${option.name} choice ${choice.name} has name longer than 110 chars: "${choice.name}" (${choice.name.length} chars)`);
                    }
                    if (typeof choice.value === 'string' && choice.value.length > 100) {
                        validationErrors.push(`Command ${cmd.name} option ${option.name} choice ${choice.name} has value longer than 100 chars: "${choice.value}" (${choice.value.length} chars)`);
                    }
                }
            }

            if (!option.options) {
                continue;
            }

            for (const subOption of option.options) {
                if (subOption.name && subOption.name.length > 32) {
                    validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} has name longer than 32 chars: "${subOption.name}" (${subOption.name.length} chars)`);
                }
                if (subOption.description && subOption.description.length > 110) {
                    validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} has description longer than 110 chars: "${subOption.description}" (${subOption.description.length} chars)`);
                }

                if (!subOption.choices) {
                    continue;
                }

                for (const choice of subOption.choices) {
                    if (choice.name && choice.name.length > 110) {
                        validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} choice ${choice.name} has name longer than 110 chars: "${choice.name}" (${choice.name.length} chars)`);
                    }
                    if (typeof choice.value === 'string' && choice.value.length > 100) {
                        validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} choice ${choice.name} has value longer than 100 chars: "${choice.value}" (${choice.value.length} chars)`);
                    }
                }
            }
        }
    }

    if (validationErrors.length > 0) {
        logger.error('Command validation failed. Errors:');
        validationErrors.forEach((error) => logger.error(`  - ${error}`));
        throw new Error(`Command validation failed with ${validationErrors.length} errors`);
    }
}

function prepareCommandsForRegistration(commands: CommandJSON[]): CommandJSON[] {
    if (commands.length >= COMMAND_COUNT_WARN_THRESHOLD) {
        logger.warn(`Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} global command limit`);
    }

    if (commands.length <= MAX_COMMANDS) {
        return commands;
    }

    logger.warn(`Command count (${commands.length}) exceeds Discord limit (${MAX_COMMANDS}), truncating...`);
    const truncated = commands.slice(0, MAX_COMMANDS);
    logger.info(`Truncated to ${truncated.length} commands for registration`);
    return truncated;
}

async function registerGlobalCommands(
    client: NexoClient,
    clientId: string | null,
    commands: CommandJSON[],
    totalSubcommands: number,
): Promise<void> {
    if (!clientId) {
        throw new Error('CLIENT_ID is required for slash command registration');
    }

    if (!client.rest) {
        throw new Error('Discord REST client is not available for slash command registration');
    }

    logger.info(`Preparing to register ${totalSubcommands + commands.length} commands globally`);
    logger.info('Validating commands before registration...');
    validateCommands(commands);
    logger.info('Command validation passed');

    const commandsToRegister = prepareCommandsForRegistration(commands);

    if (botConfig.commands?.deleteCommands) {
        logger.info('Clearing existing global commands before registration...');
        await client.rest.put(`/applications/${clientId}/commands`, { body: [] });
    }

    logger.info(`Registering ${commandsToRegister.length} global commands...`);
    await client.rest.put(`/applications/${clientId}/commands`, { body: commandsToRegister });
    logger.info(`Successfully registered ${commandsToRegister.length} global commands`);
    logger.info('Global commands may take up to an hour to appear in all servers on first deploy');
}

export async function registerCommands(client: NexoClient, options: { clientId?: string | null } = {}): Promise<void> {
    const { clientId = null } = options;

    try {
        const { commands, totalSubcommands } = collectCommandPayloads(client);
        await registerGlobalCommands(client, clientId, commands, totalSubcommands);
    } catch (error) {
        logger.error('Error registering commands:', error);
        throw error;
    }
}

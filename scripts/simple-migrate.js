import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const OLD_COMMANDS_DIR = path.join(__dirname, '..', 'commands');
const NEW_COMMANDS_DIR = path.join(__dirname, '..', 'src', 'commands');

// Command template
const COMMAND_TEMPLATE = (commandData) => `import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: ${commandData.oldPath}
export default {
    data: new SlashCommandBuilder()
        .setName('${commandData.name}')
        .setDescription('${commandData.description || 'No description provided'}')
        // Add options here if needed
        .toJSON(),

    async execute(interaction, client) {
        try {
            // TODO: Implement command logic here
            // This is a migrated command. Please implement the logic.
            
            await interaction.reply({
                embeds: [
                    createEmbed({
                        title: 'Command Executed',
                        description: 'This is a migrated command. Implementation pending.',
                        color: 'info'
                    })
                ],
                components: [getPromoRow()],
                ephemeral: true
            });
            
        } catch (error) {
            logger.error('Error in ${commandData.name} command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [
                        createEmbed({
                            title: '❌ Error',
                            description: 'An error occurred while executing this command.',
                            color: 'error'
                        })
                    ],
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    embeds: [
                        createEmbed({
                            title: '❌ Error',
                            description: 'An error occurred while executing this command.',
                            color: 'error'
                        })
                    ],
                    ephemeral: true
                });
            }
        }
    }
};`;

/**
 * Recursively gets all command files from a directory
 */
async function getCommandFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let files = [];
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
            files = files.concat(await getCommandFiles(fullPath));
        } else if (entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    
    return files;
}

/**
 * Extracts basic command data from a file
 */
async function extractCommandData(filePath) {
    try {
        // Get the command name from the file path
        const commandName = path.basename(filePath, '.js');
        const relativePath = path.relative(process.cwd(), filePath);
        
        // Try to get the description from the file
        let description = 'No description provided';
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const descMatch = fileContent.match(/setDescription\(['"]([^'"]+)['"]\)/);
            if (descMatch && descMatch[1]) {
                description = descMatch[1];
            }
        } catch (e) {
            logger.warn(`Could not read file ${filePath}:`, e.message);
        }
        
        return {
            name: commandName,
            description: description,
            category: path.basename(path.dirname(filePath)),
            oldPath: relativePath
        };
    } catch (error) {
        logger.error(`Error processing ${filePath}:`, error);
        return null;
    }
}

/**
 * Migrates a single command file
 */
async function migrateCommand(filePath) {
    try {
        // Extract command data
        const commandData = await extractCommandData(filePath);
        if (!commandData) return false;
        
        // Determine new path
        const relativePath = path.relative(OLD_COMMANDS_DIR, filePath);
        const newPath = path.join(NEW_COMMANDS_DIR, relativePath);
        const newDir = path.dirname(newPath);
        
        // Create directory if it doesn't exist
        await fs.mkdir(newDir, { recursive: true });
        
        // Skip if file already exists
        try {
            await fs.access(newPath);
            logger.info(`Skipping ${relativePath} (already exists)`);
            return true;
        } catch {
            // File doesn't exist, continue with migration
        }
        
        // Generate new command content
        const content = COMMAND_TEMPLATE(commandData);
        
        // Write new file
        await fs.writeFile(newPath, content, 'utf8');
        logger.info(`Migrated ${relativePath}`);
        
        return true;
    } catch (error) {
        logger.error(`Failed to migrate ${filePath}:`, error);
        return false;
    }
}

/**
 * Main migration function
 */
async function migrateCommands() {
    try {
        logger.info('Starting command migration (simple mode)...');
        
        // Get all command files
        const commandFiles = await getCommandFiles(OLD_COMMANDS_DIR);
        logger.info(`Found ${commandFiles.length} command files to migrate`);
        
        // Process each command
        let successCount = 0;
        const failedFiles = [];
        
        for (const file of commandFiles) {
            const success = await migrateCommand(file);
            if (success) {
                successCount++;
            } else {
                failedFiles.push(path.relative(process.cwd(), file));
            }
        }
        
        // Log results
        logger.info(`\nMigration complete!`);
        logger.info(`Successfully migrated: ${successCount}/${commandFiles.length} commands`);
        
        if (failedFiles.length > 0) {
            logger.warn('\nFailed to migrate the following files:');
            failedFiles.forEach(file => logger.warn(`- ${file}`));
        }
        
        logger.info('\nPlease review the migrated commands and update their implementations as needed.');
        
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run the migration
migrateCommands();

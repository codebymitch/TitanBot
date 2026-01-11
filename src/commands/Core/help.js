import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow, createButton } from '../../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Button IDs for interaction handling
const COMMAND_LIST_ID = 'help-command-list';
const BACK_BUTTON_ID = 'help-back-to-main';

// Icons for command categories
const CATEGORY_ICONS = {
    Core: 'ℹ️',
    Moderation: '🛡️',
    Economy: '💰',
    Fun: '🎮',
    Leveling: '📊',
    Utility: '🔧',
    Ticket: '🎫',
    Welcome: '👋',
    Giveaway: '🎉',
    Counter: '🔢',
    Tools: '🛠️',
    Search: '🔍',
    Reaction_Roles: '🎭',
    Community: '👥',
    Birthday: '🎂',
    Config: '⚙️'
};

/**
 * Creates the initial help menu embed and components
 * @returns {Object} Object containing embeds and components
 */
function createInitialHelpMenu() {
    const embed = createEmbed({
        title: '📖 Help Menu',
        description: 'Use `/commandlist` to see all commands.\nJoin our [Support Server](https://discord.gg/YOUR_SERVER_INVITE)',
        color: 'primary'
    });

    const commandListButton = createButton(
        COMMAND_LIST_ID,
        'Command List',
        'primary',
        '📋',
        false
    );

    const promoRow = getPromoRow();
    
    // Create a new row with the command list button and promo buttons
    const buttonRow = new ActionRowBuilder().addComponents([
        commandListButton,
        ...promoRow.components
    ]);

    return { 
        embeds: [embed], 
        components: [buttonRow],
        ephemeral: true
    };
}

/**
 * Creates the command list menu with all available commands
 * @param {Collection} commands Collection of registered commands
 * @returns {Object} Object containing embeds and components
 */
async function createCommandListMenu(commands) {
    // Group commands by category
    const categories = new Collection();
    
    // Get all command files
    const commandsPath = path.join(__dirname, '../../commands');
    const categoryDirs = (await fs.readdir(commandsPath, { withFileTypes: true }))
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    // Initialize categories
    for (const category of categoryDirs) {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        const icon = CATEGORY_ICONS[categoryName] || '📁';
        categories.set(category, {
            name: `${icon} ${categoryName}`,
            commands: []
        });
    }
    
    // Populate categories with commands
    for (const [name, command] of commands) {
        if (command.data.name === 'help' || command.data.name === 'commandlist') continue;
        
        const category = name.split('/')[0] || 'Uncategorized';
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        
        if (!categories.has(category)) {
            categories.set(category, {
                name: `📁 ${categoryName}`,
                commands: []
            });
        }
        
        categories.get(category).commands.push({
            name: command.data.name,
            description: command.data.description || 'No description',
            options: command.data.options || []
        });
    }
    
    // Sort categories and commands
    const sortedCategories = Array.from(categories.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
    );
    
    sortedCategories.forEach(category => {
        category.commands.sort((a, b) => a.name.localeCompare(b.name));
    });
    
    // Create embed with command list
    const embed = createEmbed({
        title: '📋 Command List',
        description: 'Here are all available commands:',
        color: 'info',
        fields: sortedCategories
            .filter(category => category.commands.length > 0)
            .map(category => ({
                name: category.name,
                value: category.commands
                    .map(cmd => `• **/${cmd.name}** - ${cmd.description}`)
                    .join('\n'),
                inline: true
            }))
    });
    
    // Create back button
    const backButton = createButton(
        BACK_BUTTON_ID,
        'Back to Help',
        'secondary',
        '⬅️',
        false
    );
    
    const buttonRow = new ActionRowBuilder().addComponents([
        backButton,
        ...getPromoRow().components
    ]);
    
    return {
        embeds: [embed],
        components: [buttonRow],
        ephemeral: true
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays the help menu with all available commands'),

    async execute(interaction, client) {
        // Create initial help menu
        const { embeds, components, ephemeral } = createInitialHelpMenu();
        
        // Send initial response
        const reply = await interaction.reply({
            embeds,
            components,
            ephemeral: ephemeral !== false
        });
        
        // Set up collector for button interactions
        const filter = i => i.user.id === interaction.user.id;
        const collector = reply.createMessageComponentCollector({ 
            filter, 
            time: 300000 // 5 minutes
        });
        
        collector.on('collect', async i => {
            try {
                if (i.customId === COMMAND_LIST_ID) {
                    // Show command list
                    const { embeds, components } = await createCommandListMenu(client.commands);
                    await i.update({ embeds, components });
                } else if (i.customId === BACK_BUTTON_ID) {
                    // Show main help menu
                    const { embeds, components } = createInitialHelpMenu();
                    await i.update({ embeds, components });
                }
            } catch (error) {
                console.error('Error in help command interaction:', error);
                
                if (!i.replied && !i.deferred) {
                    await i.reply({
                        embeds: [createEmbed({
                            title: '❌ Error',
                            description: 'An error occurred while processing your request.',
                            color: 'error'
                        })],
                        ephemeral: true
                    }).catch(console.error);
                } else {
                    await i.followUp({
                        embeds: [createEmbed({
                            title: '❌ Error',
                            description: 'An error occurred while processing your request.',
                            color: 'error'
                        })],
                        ephemeral: true
                    }).catch(console.error);
                }
            }
        });
        
        collector.on('end', () => {
            // Disable buttons when collector ends
            if (!reply.editable) return;
            
            const disabledComponents = reply.components.map(row => 
                ActionRowBuilder.from(row).setComponents(
                    row.components.map(component => 
                        ButtonBuilder.from(component).setDisabled(true)
                    )
                )
            );
            
            reply.edit({ components: disabledComponents }).catch(console.error);
        });
    }
};

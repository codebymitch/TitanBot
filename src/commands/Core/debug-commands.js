import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
    data: new SlashCommandBuilder()
        .setName('debug-commands')
        .setDescription('List all loaded commands (Debug command)')
        .setDMPermission(false),

    async execute(interaction, config, client) {
        // Only allow bot owner to use this command
        if (interaction.user.id !== client.application.owner?.id) {
            return interaction.reply({
                embeds: [{ title: 'Permission Denied', description: 'Only the bot owner can use this command.' }],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const commands = Array.from(client.commands.values());
            const uniqueCommands = new Set();
            
            // Group commands by category
            const commandsByCategory = {};
            
            for (const command of commands) {
                if (command.data && command.data.name) {
                    uniqueCommands.add(command.data.name);
                    
                    const category = command.category || 'Unknown';
                    if (!commandsByCategory[category]) {
                        commandsByCategory[category] = [];
                    }
                    commandsByCategory[category].push({
                        name: command.data.name,
                        description: command.data.description,
                        hasExecute: typeof command.execute === 'function',
                        filePath: command.filePath || 'Unknown'
                    });
                }
            }

            const embed = createEmbed(
                '🔍 Debug: Loaded Commands',
                `Total unique commands: ${uniqueCommands.size}\nTotal command entries: ${commands.length}`
            );

            // Add commands by category
            for (const [category, categoryCommands] of Object.entries(commandsByCategory)) {
                const commandList = categoryCommands
                    .map(cmd => `\`${cmd.name}\` - ${cmd.description}`)
                    .join('\n');
                
                embed.addFields({
                    name: `${category} (${categoryCommands.length})`,
                    value: commandList || 'No commands',
                    inline: false
                });
            }

            embed.addFields({
                name: '🎯 Target Commands Check',
                value: `afk: ${client.commands.has('afk') ? '✅' : '❌'}\n` +
                       `afklist: ${client.commands.has('afklist') ? '✅' : '❌'}\n` +
                       `afkstats: ${client.commands.has('afkstats') ? '✅' : '❌'}\n` +
                       `next-birthdays: ${client.commands.has('next-birthdays') ? '✅' : '❌'}`,
                inline: true
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in debug-commands:', error);
            await interaction.editReply({
                embeds: [{ 
                    title: 'Error', 
                    description: `An error occurred: ${error.message}` 
                }]
            });
        }
    }
};

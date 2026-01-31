import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { REST, Routes } from 'discord.js';
import config from '../../config/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName("refresh-commands")
        .setDescription("Force refresh all slash commands (Bot Owner Only)")
        .addStringOption(option =>
            option
                .setName("scope")
                .setDescription("Command scope to refresh")
                .addChoices(
                    { name: "Guild (Fast)", value: "guild" },
                    { name: "Global (Slow)", value: "global" }
                )
                .setRequired(false)
        ),

    async execute(interaction, guildConfig, client) {
        // Check if user is bot owner
        const ownerId = process.env.OWNER_IDS?.split(',') || [];
        if (!ownerId.includes(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed("This command can only be used by the bot owner.")],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const scope = interaction.options.getString("scope") || "guild";
        
        try {
            const rest = new REST({ version: '10' }).setToken(config.bot.token);
            
            if (scope === "guild") {
                // Clear and re-register guild commands
                await rest.put(
                    Routes.applicationGuildCommands(config.bot.clientId, config.bot.guildId),
                    { body: [] }
                );
                
                // Wait a moment for Discord to process
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Re-register all commands
                const commands = [];
                for (const command of client.commands.values()) {
                    if (command.data && typeof command.data.toJSON === 'function') {
                        commands.push(command.data.toJSON());
                    }
                }
                
                await rest.put(
                    Routes.applicationGuildCommands(config.bot.clientId, config.bot.guildId),
                    { body: commands }
                );
                
                await interaction.editReply({
                    embeds: [successEmbed(
                        "✅ Commands Refreshed!",
                        `Successfully refreshed **${commands.length}** commands for this guild.\n\nCommands should appear within 1-2 minutes.\n\nTry refreshing Discord (Ctrl+R) if they don't appear.`
                    )]
                });
                
            } else {
                // Global commands (takes up to 1 hour to propagate)
                const commands = [];
                for (const command of client.commands.values()) {
                    if (command.data && typeof command.data.toJSON === 'function') {
                        commands.push(command.data.toJSON());
                    }
                }
                
                await rest.put(
                    Routes.applicationCommands(config.bot.clientId),
                    { body: commands }
                );
                
                await interaction.editReply({
                    embeds: [successEmbed(
                        "✅ Global Commands Refreshed!",
                        `Successfully refreshed **${commands.length}** global commands.\n\n⚠️ **Note**: Global commands can take up to 1 hour to appear in all servers.\n\nGuild commands are recommended for testing.`
                    )]
                });
            }
            
        } catch (error) {
            console.error("Error refreshing commands:", error);
            await interaction.editReply({
                embeds: [errorEmbed("Failed to refresh commands. Check the console for details.")]
            });
        }
    }
};

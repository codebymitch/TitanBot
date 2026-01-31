import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { loadCommands, registerCommands } from '../../handlers/commandLoader.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reload-commands')
        .setDescription('Reload and re-register all bot commands (Admin only)')
        .setDMPermission(false),

    async execute(interaction, config, client) {
        // Only allow bot owner or server admins to use this command
        if (!interaction.member.permissions.has('Administrator') && interaction.user.id !== client.application.owner?.id) {
            return interaction.reply({
                embeds: [errorEmbed('Permission Denied', 'Only administrators can use this command.')],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            await interaction.editReply({
                embeds: [createEmbed('🔄 Reloading Commands', 'Loading all commands...')]
            });

            // Reload commands
            await loadCommands(client);
            
            await interaction.editReply({
                embeds: [createEmbed('🔄 Reloading Commands', `Loaded ${client.commands.size} commands. Re-registering with Discord...`)]
            });

            // Re-register commands
            await registerCommands(client, client.config.bot.guildId);

            await interaction.editReply({
                embeds: [successEmbed(
                    '✅ Commands Reloaded',
                    `Successfully reloaded and re-registered ${client.commands.size} commands!`
                )]
            });

        } catch (error) {
            console.error('Error reloading commands:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Reload Failed', `An error occurred: ${error.message}`)]
            });
        }
    }
};

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

function getIcon(folder) {
    const icons = {
        Core: "ℹ️",
        Moderation: "🛡️",
        Economy: "💰",
        Utility: "🛠️",
        Tickets: "🎫",
        Fun: "🎲",
        Leveling: "✨",
        Birthday: "🎁",
        Counter: "🔟",
        Giveaway: "🎉",
        Reaction_roles: "🔔",
        Search: "🔍",
        Tools: "🔨",
    };
    return icons[folder] || "📂";
}

/**
 * Creates the dynamic Command List embed based on command files in the 'commands' directory.
 * @returns {EmbedBuilder}
 */
function createCommandListEmbed() {
    const foldersPath = path.join(process.cwd(), "commands");
    const commandFolders = fs.readdirSync(foldersPath);

    const embed = createEmbed({ title: "📜 TitanBot Command List", description: "Here is a complete list of all available commands, organized by category.", });

    let totalCommands = 0;

    // Loop through every folder in 'commands/'
    for (const folder of commandFolders) {
        // Skip system files if any exist
        if (folder.startsWith(".")) continue;

        const commandsPath = path.join(foldersPath, folder);

        // Ensure it is a directory
        if (fs.lstatSync(commandsPath).isDirectory()) {
            const commandFiles = fs
                .readdirSync(commandsPath)
                .filter((file) => file.endsWith(".js"));

            if (commandFiles.length > 0) {
                // Format: `/ban`, `/kick`
                const fileNames = commandFiles.map(
                    (file) => `\`/${file.replace(".js", "")}\``,
                );
                totalCommands += commandFiles.length;

                // Add field to embed
                embed.addFields({
                    name: `${getIcon(folder)} ${folder}`,
                    value: fileNames.join(", "),
                    inline: false,
                });
            }
        }
    }

    embed.setFooter({ text: `TitanBot • ${totalCommands} Commands Loaded` });
    return embed;
}
export default {
    data: new SlashCommandBuilder()
        .setName("commandlist")
        .setDescription("Displays a full list of all available bot commands."),

    async execute(interaction) {
        const commandListEmbed = createCommandListEmbed();

        // This command replies ephemerally and does not need buttons.
        await interaction.reply({
            embeds: [commandListEmbed],
            ephemeral: false,
        });
    },
};

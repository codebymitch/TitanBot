import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { deleteBirthday } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
try {
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const success = await deleteBirthday(client, guildId, userId);

            if (success) {
                await interaction.reply({
                    embeds: [successEmbed(
                        "Birthday Removed 🗑️",
                        "Your birthday has been successfully removed from the server."
                    )]
                });
            } else {
                await interaction.editReply({
                    embeds: [errorEmbed(
                        "No Birthday Found",
                        "You don't have a birthday set to remove."
                    )]
                });
            }
        } catch (error) {
            console.error("Forgot birthday command error:", error);
            await interaction.editReply({
                embeds: [errorEmbed("Error", "Failed to remove your birthday.")]
            });
        }
    }
};

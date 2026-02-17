import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';

export default {
    async execute(interaction, config, client) {
try {
            const channel = interaction.options.getChannel("channel");
            const guildId = interaction.guildId;

            let guildConfig = await getGuildConfig(client, guildId);

            if (channel) {
                guildConfig.birthdayChannelId = channel.id;
                await setGuildConfig(client, guildId, guildConfig);

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "🎂 Birthday Announcements Enabled",
                            `Birthday announcements will now be posted in ${channel}.`,
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                guildConfig.birthdayChannelId = null;
                await setGuildConfig(client, guildId, guildConfig);

                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "🎂 Birthday Announcements Disabled",
                            "Birthday announcements have been disabled. No channel selected.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            console.error("config_birthday_toggle error:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Configuration Error",
                        "Could not save the birthday configuration.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }
    }
};




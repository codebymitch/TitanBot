import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getLevelingConfig, saveLevelingConfig } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("levelconfig")
        .setDescription("Configure the leveling system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("toggle")
                .setDescription("Enable or disable the leveling system")
                .addBooleanOption(option =>
                    option
                        .setName("enabled")
                        .setDescription("Whether to enable or disable the leveling system")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("channel")
                .setDescription("Set the level up notification channel")
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("The channel to send level up notifications to")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("xp")
                .setDescription("Set the XP range per message")
                .addIntegerOption(option =>
                    option
                        .setName("min")
                        .setDescription("Minimum XP per message")
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addIntegerOption(option =>
                    option
                        .setName("max")
                        .setDescription("Maximum XP per message")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("message")
                .setDescription("Set the level up message")
                .addStringOption(option =>
                    option
                        .setName("text")
                        .setDescription("Use {user} for the username and {level} for the level")
                        .setRequired(true)
                )
        )
        .setDMPermission(false),
    category: "Leveling",
    
    async execute(interaction, config, client) {
try {
            const subcommand = interaction.options.getSubcommand();
            const levelingConfig = await getLevelingConfig(client, interaction.guildId);
            
            switch (subcommand) {
                case "toggle": {
                    const enabled = interaction.options.getBoolean("enabled");
                    levelingConfig.enabled = enabled;
                    
                    await saveLevelingConfig(client, interaction.guildId, levelingConfig);
                    
                    await interaction.reply({
                        embeds: [createEmbed({ title: "Leveling System Updated", description: `The leveling system has been ${enabled ? "enabled" : "disabled"}.` })]
                    });
                    break;
                }
                
                case "channel": {
                    const channel = interaction.options.getChannel("channel");
                    levelingConfig.levelUpChannel = channel.id;
                    
                    await saveLevelingConfig(client, interaction.guildId, levelingConfig);
                    
                    await interaction.editReply({
                        embeds: [createEmbed({ title: "Level Up Channel Set", description: `Level up notifications will now be sent in ${channel}.` })]
                    });
                    break;
                }
                
                case "xp": {
                    const min = interaction.options.getInteger("min");
                    const max = interaction.options.getInteger("max");
                    
                    if (min > max) {
                        return interaction.editReply({
                            embeds: [createEmbed({ title: "Invalid Range", description: "The minimum XP cannot be greater than the maximum XP." })]
                        });
                    }
                    
                    levelingConfig.xpRange = { min, max };
                    await saveLevelingConfig(client, interaction.guildId, levelingConfig);
                    
                    await interaction.editReply({
                        embeds: [createEmbed({ title: "XP Range Updated", description: `XP per message is now between ${min} and ${max}.` })]
                    });
                    break;
                }
                
                case "message": {
                    const text = interaction.options.getString("text");
                    levelingConfig.levelUpMessage = text;
                    
                    await saveLevelingConfig(client, interaction.guildId, levelingConfig);
                    
                    await interaction.editReply({
                        embeds: [createEmbed({ title: "Level Up Message Updated", description: `The level up message has been updated.` })]
                    });
                    break;
                }
            }
            
        } catch (error) {
            console.error("LevelConfig command error:", error);
            await interaction.editReply({
                embeds: [createEmbed({ title: "Error", description: "An error occurred while updating the leveling configuration." })]
            });
        }
    }
};



import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, getMaxBankCapacity } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

// Migrated from: commands/Economy/ebalance.js
export default {
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("ebalance")
        .setDescription("Check your current cash and bank balance.")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("The user whose balance you want to check.")
                .setRequired(false),
        )
        .setDMPermission(false),

    // Prefix command data
    name: "ebalance",
    aliases: ["bal", "balance"],
    description: "Check your current cash and bank balance.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}ebalance [@user]`,
    cooldown: 3,

    // Slash command execution
    async execute(interaction, config, client) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser("user") || interaction.user;
        const guildId = interaction.guildId;

        if (targetUser.bot) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Balance Check Failed",
                        "Bots don't have an economy balance.",
                    ),
                ],
            });
        }

        try {
            const userData = await getEconomyData(client, guildId, targetUser.id);
            const maxBank = getMaxBankCapacity(userData);

            const embed = createEmbed({
                title: `💰 ${targetUser.username}'s Balance`,
                description: `Here is the current financial status for ${targetUser.username}.`,
            })
                .addFields(
                    {
                        name: "💵 Cash",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 Bank",
                        value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "� Total",
                        value: `$${(userData.wallet + userData.bank).toLocaleString()}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Error in ebalance command:", error);
            await interaction.editReply({
                embeds: [errorEmbed("Failed to fetch balance. Please try again later.")],
            });
        }
    },

    // Prefix command execution
    async executeMessage(message, args, client) {
        const targetUser = message.mentions.users.first() || message.author;

        try {
            const economyData = await getEconomyData(client, message.guild.id, targetUser.id);
            const maxBankCapacity = getMaxBankCapacity(economyData);

            const embed = createEmbed({
                title: `💰 ${targetUser.username}'s Balance`,
                description: `Here's your current financial status:`,
                color: '#00FF00'
            });

            embed.addFields(
                {
                    name: '💵 Cash',
                    value: `\`${economyData.wallet.toLocaleString()}\``,
                    inline: true
                },
                {
                    name: '🏦 Bank',
                    value: `\`${economyData.bank.toLocaleString()}\` / \`${maxBankCapacity.toLocaleString()}\``,
                    inline: true
                },
                {
                    name: '💎 Total',
                    value: `\`${(economyData.wallet + economyData.bank).toLocaleString()}\``,
                    inline: true
                }
            );

            embed.setFooter({
                text: `Requested by ${message.author.tag}`,
                iconURL: message.author.displayAvatarURL()
            });

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in ebalance command:', error);
            await message.reply({
                embeds: [errorEmbed('Failed to fetch balance. Please try again later.')]
            });
        }
    }
};

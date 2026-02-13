import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, getMaxBankCapacity } from '../../utils/economy.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Check your or someone else's balance")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check balance for')
                .setRequired(false)
        ),

    async execute(interaction, config, client) {
        try {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const guildId = interaction.guildId;

            if (targetUser.bot) {
                return await interaction.reply({
                    embeds: [errorEmbed(
                        "❌ Invalid Target",
                        "Bots don't have an economy balance."
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }

            const userData = await getEconomyData(client, guildId, targetUser.id);
            const maxBank = getMaxBankCapacity(userData);

            const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
            const bank = typeof userData.bank === 'number' ? userData.bank : 0;

            const embed = createEmbed({
                title: `💰 ${targetUser.username}'s Balance`,
                description: `Here is the current financial status for ${targetUser.username}.`,
            })
                .addFields(
                    {
                        name: "💵 Cash",
                        value: `$${wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 Bank",
                        value: `$${bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "💎 Total",
                        value: `$${(wallet + bank).toLocaleString()}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Balance command error:', error);
            try {
                await interaction.reply({
                    embeds: [errorEmbed(
                        "❌ Error",
                        "Something went wrong while checking balance. Please try again."
                    )],
                    flags: MessageFlags.Ephemeral
                });
            } catch (replyError) {
                console.error('Failed to send error response:', replyError);
            }
        }
    },
};





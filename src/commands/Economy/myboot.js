import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import botConfig from '../../config/botConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName('myboot')
        .setDescription('Tingnan ang iyong active listings at seller profile'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle(`📦 Trading Boot ni ${interaction.user.username}`)
            .setColor(botConfig.embeds.colors.secondary || "#e67e22")
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setDescription("Welcome sa iyong personal trading boot! Gamitin ang `/addpet` para mag-post ng mga pets na gusto mong i-trade mula sa Grow a Garden.")
            .addFields(
                { name: '👤 Seller Status', value: '🟢 Online & Ready to Trade', inline: true },
                { name: '💰 Currency', value: botConfig.economy.currency.name, inline: true },
                { name: '📝 Paano mag-list?', value: 'I-type ang `/addpet` at ilagay ang pangalan ng pet, presyo, at image link mula sa Wiki.', inline: false }
            )
            .setFooter({ text: "Grow a Garden Market System" })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};

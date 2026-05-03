import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import botConfig from '../../config/botConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName('addpet')
        .setDescription('Magdagdag ng pet sa iyong trading boot')
        .addStringOption(option => 
            option.setName('pet_name')
                .setDescription('Pangalan ng pet (hal. Diamond Seedling)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('presyo')
                .setDescription('Magkano mo ibebenta?')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('image_url')
                .setDescription('Link ng image galing sa Grow a Garden Wiki')
                .setRequired(false)),

    async execute(interaction) {
        const name = interaction.options.getString('pet_name');
        const price = interaction.options.getString('presyo');
        const image = interaction.options.getString('image_url');

        // Gagawa ng magandang card (Embed) para sa pet
        const embed = new EmbedBuilder()
            .setTitle(`🐾 Bagong Listing sa Market!`)
            .setColor(botConfig.embeds.colors.primary || "#2ecc71")
            .setDescription(`Nag-post si **${interaction.user.username}** ng item para sa trade.`)
            .addFields(
                { name: 'Pet Name', value: `**${name}**`, inline: true },
                { name: 'Price', value: `💰 ${price}`, inline: true }
            )
            .setFooter({ text: "Grow a Garden Trading System" })
            .setTimestamp();

        // Check kung valid ang image URL na nilagay
        if (image && image.startsWith('http')) {
            embed.setThumbnail(image);
        } else {
            // Default icon kung walang image link
            embed.setThumbnail('https://static.wikia.nocookie.net/grow-a-garden/images/8/8e/Site-logo.png');
        }

        await interaction.reply({ 
            content: "✅ Tagumpay na naidagdag ang iyong pet sa listahan!", 
            embeds: [embed] 
        });
    }
};


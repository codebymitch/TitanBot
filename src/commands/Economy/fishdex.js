import {
    ActionRowBuilder,
    ComponentType,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';
import { FISH_TYPES } from './fish.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

const RARITIES = [...new Set(FISH_TYPES.map(fish => fish.rarity))];
const RARITY_COLORS = {
    common: 0x95A5A6,
    uncommon: 0x2ECC71,
    rare: 0x3498DB,
    epic: 0x9B59B6,
    legendary: 0xF1C40F,
    mythic: 0xE91E63,
    secret: 0xFF0000,
    divine: 0x00FFFF,
    transcendent: 0xFF00FF,
    celestial: 0xFF69B4,
};

const IMAGE_HINTS = {
    common: 'common freshwater fish, natural underwater photography',
    uncommon: 'colorful tropical fish, natural underwater photography',
    rare: 'rare deep sea fish, detailed underwater art',
    epic: 'magical rare fish with vivid colors, fantasy art',
    legendary: 'legendary sea creature with a glowing aura, epic fantasy art',
    mythic: 'mythical giant sea creature, magical glow, epic fantasy art',
    secret: 'mysterious shadowy abyssal sea creature, dark fantasy art',
    divine: 'divine celestial sea creature, holy golden light, epic fantasy art',
    transcendent: 'cosmic sea creature among galaxies and starlight, epic fantasy art',
    celestial: 'cute pink nine-tailed fox fish, glowing magical aura, fantasy art',
};

function createImageUrl(fish) {
    const prompt = `${fish.name}, ${IMAGE_HINTS[fish.rarity]}, single subject, centered, highly detailed`;
    let seed = 0;
    for (let i = 0; i < fish.name.length; i++) {
        seed = (seed * 31 + fish.name.charCodeAt(i)) >>> 0;
    }
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=256&height=256&nologo=true&seed=${seed}`;
}

function makeFishEmbeds(rarity, targetUser, fishCollection) {
    const pageFish = FISH_TYPES.filter(fish => fish.rarity === rarity);
    const caughtSpecies = FISH_TYPES.filter(
        fish => Number(fishCollection[fish.name]) > 0
    ).length;

    return pageFish.map((fish, index) => {
        const count = Number(fishCollection[fish.name]) || 0;
        const embed = new EmbedBuilder()
            .setColor(RARITY_COLORS[fish.rarity] ?? 0x5865F2)
            .setTitle(`${fish.emoji} ${fish.name}`);

        if (count > 0) {
            embed
                .setDescription(`Tertangkap **${count}x**`)
                .setThumbnail(createImageUrl(fish));
        } else {
            embed.setDescription('Belum tertangkap');
        }

        if (index === pageFish.length - 1) {
            embed.setFooter({
                text: `${targetUser.username}: ${caughtSpecies}/${FISH_TYPES.length} spesies | ${pageFish.length} ikan ${rarity}`,
                iconURL: targetUser.displayAvatarURL(),
            });
        }
        return embed;
    });
}

function makeComponents(selectedRarity, customIdPrefix, disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`${customIdPrefix}_rarity`)
                .setPlaceholder('Pilih rarity ikan')
                .setDisabled(disabled)
                .addOptions(RARITIES.map(rarity => ({
                    label: rarity.charAt(0).toUpperCase() + rarity.slice(1),
                    value: rarity,
                    default: rarity === selectedRarity,
                }))),
        ),
    ];
}

export default {
    data: new SlashCommandBuilder()
        .setName('fishdex')
        .setDescription('Lihat index ikan tangkapanmu atau pengguna lain')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Pengguna yang index ikannya ingin dilihat')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        if (targetUser.bot) {
            throw createError(
                'Cannot view bot fishdex',
                ErrorTypes.VALIDATION,
                'Bot tidak memiliki index tangkapan ikan.'
            );
        }

        const userData = await getEconomyData(client, interaction.guildId, targetUser.id);
        const fishCollection = userData.fishCollection || {};
        const customIdPrefix = `fishdex_${interaction.id}`;
        let selectedRarity = RARITIES[0];

        await interaction.reply({
            embeds: makeFishEmbeds(selectedRarity, targetUser, fishCollection),
            components: makeComponents(selectedRarity, customIdPrefix),
        });
        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000,
        });

        collector.on('collect', async selectInteraction => {
            if (selectInteraction.user.id !== interaction.user.id) {
                await selectInteraction.reply({
                    content: 'Hanya orang yang membuka fishdex ini yang bisa memilih rarity.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await selectInteraction.deferUpdate();
            selectedRarity = selectInteraction.values[0];

            await message.edit({
                embeds: makeFishEmbeds(selectedRarity, targetUser, fishCollection),
                components: makeComponents(selectedRarity, customIdPrefix),
            });
        });

        collector.on('end', async () => {
            try {
                await message.edit({
                    components: makeComponents(selectedRarity, customIdPrefix, true),
                });
            } catch (error) {
                logger.debug('fishdex: could not disable pagination buttons', {
                    error: error.message,
                });
            }
        });
    }, { command: 'fishdex' }),
};

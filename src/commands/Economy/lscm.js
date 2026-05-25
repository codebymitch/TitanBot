import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// LSCM — Los Santos Customs Marketplace (personal car buy/sell)
const CATALOG = [
    { id: 'sultan',     name: 'Karin Sultan',      price: 12000,  resale: 0.6 },
    { id: 'buffalo',    name: 'Bravado Buffalo',   price: 15000,  resale: 0.6 },
    { id: 'tornado',    name: 'Declasse Tornado',  price: 10000,  resale: 0.6 },
    { id: 'dominator',  name: 'Vapid Dominator',   price: 22000,  resale: 0.6 },
    { id: 'tailgater',  name: 'Obey Tailgater',    price: 25000,  resale: 0.6 },
    { id: 'banshee',    name: 'Bravado Banshee',   price: 45000,  resale: 0.65 },
    { id: 'infernus',   name: 'Pegassi Infernus',  price: 85000,  resale: 0.7 },
    { id: 'adder',      name: 'Truffade Adder',    price: 150000, resale: 0.75 },
    { id: 'zentorno',   name: 'Pegassi Zentorno',  price: 220000, resale: 0.75 },
];

function fmt(n) { return `$${n.toLocaleString()}`; }

export default {
    data: new SlashCommandBuilder()
        .setName('lscm')
        .setDescription('Los Santos Customs — buy, sell, or list your personal cars')
        .addSubcommand(s => s.setName('list').setDescription('See cars for sale'))
        .addSubcommand(s => s.setName('garage').setDescription('See cars you own'))
        .addSubcommand(s => s
            .setName('buy')
            .setDescription('Buy a car')
            .addStringOption(o => o.setName('car').setDescription('Car id (from /lscm list)').setRequired(true)))
        .addSubcommand(s => s
            .setName('sell')
            .setDescription('Sell a car back to LSCM')
            .addStringOption(o => o.setName('car').setDescription('Car id from your garage').setRequired(true))),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);

        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const userData = await getEconomyData(client, guildId, userId);
        userData.garage = userData.garage || [];

        if (sub === 'list') {
            const lines = CATALOG.map(c => `\`${c.id}\` — **${c.name}** — ${fmt(c.price)}`).join('\n');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [infoEmbed('🏁 LSCM — For Sale', lines)]
            });
        }

        if (sub === 'garage') {
            if (userData.garage.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed('🏠 Your Garage', 'Empty. Hit `/lscm list` to pick one up.')]
                });
            }
            const lines = userData.garage.map(c => `\`${c.id}\` — **${c.name}** (bought ${fmt(c.boughtFor)})`).join('\n');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [infoEmbed('🏠 Your Garage', lines)]
            });
        }

        if (sub === 'buy') {
            const carId = interaction.options.getString('car').toLowerCase();
            const car = CATALOG.find(c => c.id === carId);
            if (!car) throw createError('No such car', ErrorTypes.VALIDATION, 'That ID is not in the catalog. Try `/lscm list`.');

            const wallet = userData.wallet || 0;
            if (wallet < car.price) {
                throw createError('Broke', ErrorTypes.VALIDATION, `Need ${fmt(car.price)}, you got ${fmt(wallet)}.`);
            }

            userData.wallet = wallet - car.price;
            userData.garage.push({ id: car.id, name: car.name, boughtFor: car.price, resale: car.resale });
            await setEconomyData(client, guildId, userId, userData);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('🔑 Sold!', `You drove off the lot in a **${car.name}** for **${fmt(car.price)}**.`)]
            });
        }

        if (sub === 'sell') {
            const carId = interaction.options.getString('car').toLowerCase();
            const idx = userData.garage.findIndex(c => c.id === carId);
            if (idx === -1) throw createError('Not in garage', ErrorTypes.VALIDATION, "You don't own that one.");

            const car = userData.garage[idx];
            const payout = Math.floor(car.boughtFor * (car.resale || 0.6));
            userData.garage.splice(idx, 1);
            userData.wallet = (userData.wallet || 0) + payout;
            await setEconomyData(client, guildId, userId, userData);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('💸 Sold', `LSCM took the **${car.name}** off your hands for **${fmt(payout)}**.`)]
            });
        }
    }, { command: 'lscm' })
};

import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { generateWheelGIF, generateWheelImage } from '../wheel-generator.js';

export const data = new SlashCommandBuilder()
  .setName('wheel')
  .setDescription('Manage and spin saved wheels')
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List your saved wheels from Uplup')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('spin')
      .setDescription('Spin one of your saved wheels')
      .addStringOption(option =>
        option
          .setName('wheel_id')
          .setDescription('The wheel ID to spin (use /wheel list to find it)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new wheel and save it to your Uplup account')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Name for the wheel')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('entries')
          .setDescription('Comma-separated list of entries')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete a saved wheel')
      .addStringOption(option =>
        option
          .setName('wheel_id')
          .setDescription('The wheel ID to delete')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('info')
      .setDescription('Get info about a saved wheel')
      .addStringOption(option =>
        option
          .setName('wheel_id')
          .setDescription('The wheel ID to view')
          .setRequired(true)
      )
  );

export async function execute(interaction, uplupAPI) {
  if (!uplupAPI) {
    await interaction.reply({
      content: '**Uplup API not configured**\n\n' +
        'To use saved wheels, the bot owner needs to:\n' +
        '1. Get an API key at **uplup.com/brand/api-integrations**\n' +
        '2. Add it to the `.env` file:\n' +
        '```\n' +
        'UPLUP_API_KEY=uplup_live_your_key_here\n' +
        '```\n' +
        '3. Restart the bot\n\n' +
        '**Tip:** Use `/spin custom` instead - it works without API setup!',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'list': {
        const response = await uplupAPI.listWheels();
        // API v1 returns { success, data: [{ wheel_id, wheel_name, created_at }] }
        const wheels = response.data || [];

        if (wheels.length === 0) {
          await interaction.editReply({
            content: 'You don\'t have any saved wheels yet!\n\nCreate one with `/wheel create` or at **uplup.com/random-name-picker**'
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x6C60D7)
          .setTitle('Your Saved Wheels')
          .setDescription(`Found **${wheels.length}** wheel${wheels.length !== 1 ? 's' : ''}`)
          .setFooter({
            text: 'Use /wheel spin <wheel_id> to spin a wheel',
            iconURL: 'https://uplup.com/favicon.ico'
          });

        // Add wheel list
        const wheelList = wheels.slice(0, 10).map((wheel, index) => {
          return `**${index + 1}.** ${wheel.wheel_name}\n   ID: \`${wheel.wheel_id}\``;
        }).join('\n\n');

        embed.addFields({ name: 'Wheels', value: wheelList || 'No wheels found' });

        if (wheels.length > 10) {
          embed.addFields({
            name: 'More wheels',
            value: `Showing 10 of ${wheels.length}. Visit uplup.com to see all.`
          });
        }

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case 'spin': {
        const wheelId = interaction.options.getString('wheel_id');

        // Get wheel details (via list + filter since v1 has no single-wheel GET)
        let wheel;
        try {
          const wheelResponse = await uplupAPI.getWheel(wheelId);
          wheel = wheelResponse.data;
        } catch {
          await interaction.editReply({
            content: 'Wheel not found. Check the wheel ID and try again.\nUse `/wheel list` to see your wheels.'
          });
          return;
        }

        if (!wheel) {
          await interaction.editReply({
            content: 'Wheel not found. Check the wheel ID and try again.'
          });
          return;
        }

        // API v1 list returns minimal data (no entries).
        // For spinning, we pick a random winner client-side since v1
        // does not have a server-side spin endpoint.
        // Use a placeholder entries list for display purposes.
        const wheelName = wheel.wheel_name || 'Saved Wheel';

        await interaction.editReply({
          content: `To spin **${wheelName}**, visit the full wheel at:\nhttps://uplup.com/random-name-picker\n\nThe API v1 list endpoint does not include wheel entries. Use \`/spin custom\` for instant Discord spins!`
        });
        break;
      }

      case 'create': {
        const name = interaction.options.getString('name');
        const entriesString = interaction.options.getString('entries');
        const entries = entriesString.split(',').map(e => e.trim()).filter(e => e.length > 0);

        if (entries.length < 2) {
          await interaction.editReply({
            content: 'You need at least 2 entries to create a wheel!'
          });
          return;
        }

        // Hard cap at 100 for reasonable wheel sizes
        if (entries.length > 100) {
          await interaction.editReply({
            content: 'Maximum 100 entries per wheel. Please reduce your list.'
          });
          return;
        }

        const response = await uplupAPI.createWheel(name, entries);
        const wheelData = response.data;

        const embed = new EmbedBuilder()
          .setColor(0x4CAF50)
          .setTitle('Wheel Created!')
          .addFields(
            { name: 'Name', value: wheelData.wheel_name, inline: true },
            { name: 'Wheel ID', value: `\`${wheelData.wheel_id}\``, inline: true },
            { name: 'Entries', value: `${entries.length}`, inline: true }
          )
          .setDescription(
            `Your wheel has been saved to your Uplup account!\n` +
            `Spin it at **uplup.com/random-name-picker** or use \`/wheel list\` to see all your wheels.`
          )
          .setFooter({
            text: 'Powered by Uplup',
            iconURL: 'https://uplup.com/favicon.ico'
          });

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case 'delete': {
        const wheelId = interaction.options.getString('wheel_id');

        await uplupAPI.deleteWheel(wheelId);

        await interaction.editReply({
          content: `Wheel \`${wheelId}\` has been deleted.`
        });
        break;
      }

      case 'info': {
        const wheelId = interaction.options.getString('wheel_id');

        let wheel;
        try {
          const response = await uplupAPI.getWheel(wheelId);
          wheel = response.data;
        } catch {
          await interaction.editReply({
            content: 'Wheel not found. Check the wheel ID and try again.\nUse `/wheel list` to see your wheels.'
          });
          return;
        }

        if (!wheel) {
          await interaction.editReply({
            content: 'Wheel not found. Check the wheel ID and try again.'
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x6C60D7)
          .setTitle(`${wheel.wheel_name}`)
          .addFields(
            { name: 'Wheel ID', value: `\`${wheel.wheel_id}\``, inline: true }
          )
          .setFooter({
            text: 'View full wheel at uplup.com/random-name-picker',
            iconURL: 'https://uplup.com/favicon.ico'
          });

        if (wheel.created_at) {
          embed.addFields({
            name: 'Created',
            value: new Date(wheel.created_at).toLocaleDateString(),
            inline: true
          });
        }

        await interaction.editReply({ embeds: [embed] });
        break;
      }
    }
  } catch (error) {
    console.error('Wheel command error:', error);
    await interaction.editReply({
      content: `An error occurred: ${error.message}`
    });
  }
}

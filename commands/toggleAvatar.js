const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// File paths
const STATE_FILE = path.join(__dirname, '..', 'data', 'avatarState.json'); // ensure data/ exists
const ASSETS = {
  animated: path.join(__dirname, '..', 'assets', 'avatar_anim.gif'),
  static: path.join(__dirname, '..', 'assets', 'avatar_static.png'),
};

// helper to read/write state
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { enabled: false };
  }
}
function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('toggleavatar')
    .setDescription('Toggle the bot animated avatar on/off (bot owner only)')
    .addStringOption(opt =>
      opt.setName('state')
        .setDescription('on / off (omit to toggle)')
        .setRequired(false)
        .addChoices(
          { name: 'on', value: 'on' },
          { name: 'off', value: 'off' }
        )
    ),
  async execute(interaction) {
    // Restrict to bot owner(s)
    const ownerId = process.env.OWNER_ID; // set this in env or replace with an ID
    if (!ownerId || interaction.user.id !== ownerId) {
      return interaction.reply({ content: 'Only the bot owner can run this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const arg = interaction.options.getString('state');
    const state = readState();
    let newEnabled = state.enabled;

    if (arg === 'on') newEnabled = true;
    else if (arg === 'off') newEnabled = false;
    else newEnabled = !newEnabled;

    const assetPath = newEnabled ? ASSETS.animated : ASSETS.static;
    if (!fs.existsSync(assetPath)) {
      return interaction.editReply({ content: `Missing asset: ${assetPath}. Add the file and try again.` });
    }

    try {
      const buffer = fs.readFileSync(assetPath);
      await interaction.client.user.setAvatar(buffer);
      writeState({ enabled: newEnabled });
      return interaction.editReply({ content: `Animated avatar ${newEnabled ? 'enabled' : 'disabled'}.` });
    } catch (err) {
      console.error('Failed to set avatar:', err);
      return interaction.editReply({ content: `Failed to set avatar: ${err.message}` });
    }
  },
};

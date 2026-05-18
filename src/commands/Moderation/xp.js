// ============================================================
//  PHA Discord Bot — bot.js
//  Deploy on Railway. Uses discord.js v14.
//
//  Prefix commands:  ?checkxp  ?addxp  ?removexp  ?rank
//  Slash commands:   /checkxp  /addxp  /removexp  /rank
//
//  ENV VARS needed in Railway:
//    DISCORD_TOKEN       — your bot token
//    DISCORD_CLIENT_ID   — your bot's application/client ID
//    DISCORD_GUILD_ID    — your server ID (for instant slash cmd registration)
//    WORKER_URL          — https://phasystem.udrew450.workers.dev
//    DISCORD_SECRET      — secret shared with Cloudflare worker
//    XP_API_KEY          — XP API key for direct XP endpoints
//    ALLOWED_ROLE_ID     — role ID allowed to use addxp / removexp / rank
// ============================================================

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
require("dotenv").config();

// ── config ────────────────────────────────────────────────
const WORKER_URL     = process.env.WORKER_URL     || "https://phasystem.udrew450.workers.dev";
const DISCORD_SECRET = process.env.DISCORD_SECRET || "";
const XP_API_KEY     = process.env.XP_API_KEY     || "";
const ALLOWED_ROLE   = process.env.ALLOWED_ROLE_ID || "";    // role that can use staff commands
const PREFIX         = "?";

const VALID_RANKS = ["private", "pfc", "corporal", "sergeant", "staff sergeant", "technical sergeant"];

// ── Slash command definitions ──────────────────────────────
const slashCommands = [
  new SlashCommandBuilder()
    .setName("checkxp")
    .setDescription("Check a Roblox user's XP")
    .addStringOption(opt =>
      opt.setName("username").setDescription("Roblox username").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addxp")
    .setDescription("Add XP to a Roblox user")
    .addStringOption(opt =>
      opt.setName("username").setDescription("Roblox username").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Amount of XP to add").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("removexp")
    .setDescription("Remove XP from a Roblox user")
    .addStringOption(opt =>
      opt.setName("username").setDescription("Roblox username").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Amount of XP to remove").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Set a Roblox user's rank")
    .addStringOption(opt =>
      opt.setName("username").setDescription("Roblox username").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("rank")
        .setDescription("Rank to assign")
        .setRequired(true)
        .addChoices(
          { name: "Private",            value: "private" },
          { name: "PFC",                value: "pfc" },
          { name: "Corporal",           value: "corporal" },
          { name: "Sergeant",           value: "sergeant" },
          { name: "Staff Sergeant",     value: "staff sergeant" },
          { name: "Technical Sergeant", value: "technical sergeant" }
        )
    ),
].map(cmd => cmd.toJSON());

// ── register slash commands ────────────────────────────────
async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log("📡 Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: slashCommands }
    );
    console.log("✅ Slash commands registered.");
  } catch (err) {
    console.error("❌ Failed to register slash commands:", err);
  }
}

// ── Worker API helpers ─────────────────────────────────────
async function workerRequest(path, method, body, useXpKey = false) {
  const headers = { "Content-Type": "application/json" };
  if (path.startsWith("/api/xp")) {
    headers["x-api-key"] = XP_API_KEY;
  } else if (path.startsWith("/api/discord")) {
    headers["Authorization"] = DISCORD_SECRET;
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${WORKER_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker error ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiCheckXP(username) {
  return workerRequest(`/api/xp?username=${encodeURIComponent(username)}`, "GET");
}

async function apiAddXP(username, amount) {
  return workerRequest("/api/xp/add", "POST", { username, amount });
}

async function apiRemoveXP(username, amount) {
  return workerRequest("/api/xp/remove", "POST", { username, amount });
}

async function apiRank(username, rank) {
  return workerRequest("/api/discord", "POST", { command: "rank", username, rank });
}

// ── embed builders ─────────────────────────────────────────
function xpEmbed(username, xp) {
  return new EmbedBuilder()
    .setTitle("📊 XP Check")
    .setDescription(`**${username}** has **${xp.toLocaleString()} XP**`)
    .setColor(0x00bfff)
    .setTimestamp();
}

function addXPEmbed(username, added, newXP) {
  return new EmbedBuilder()
    .setTitle("➕ XP Added")
    .setDescription(`Added **${added.toLocaleString()} XP** to **${username}**\nNew Total: **${newXP.toLocaleString()} XP**`)
    .setColor(0x00ff88)
    .setTimestamp();
}

function removeXPEmbed(username, removed, newXP) {
  return new EmbedBuilder()
    .setTitle("➖ XP Removed")
    .setDescription(`Removed **${removed.toLocaleString()} XP** from **${username}**\nNew Total: **${newXP.toLocaleString()} XP**`)
    .setColor(0xff4444)
    .setTimestamp();
}

function rankEmbed(username, rank) {
  return new EmbedBuilder()
    .setTitle("✅ Rank Updated")
    .setDescription(`**${username}** has been ranked to **${rank}**`)
    .setColor(0x00ff00)
    .setTimestamp();
}

function errorEmbed(msg) {
  return new EmbedBuilder()
    .setTitle("❌ Error")
    .setDescription(msg)
    .setColor(0xff0000)
    .setTimestamp();
}

// ── permission check ───────────────────────────────────────
function hasStaffRole(member) {
  if (!ALLOWED_ROLE) return member.permissions.has(PermissionFlagsBits.ManageRoles);
  return member.roles.cache.has(ALLOWED_ROLE) || member.permissions.has(PermissionFlagsBits.Administrator);
}

// ── Discord client ─────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ── READY ──────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("PHA XP & Rank System", { type: 3 }); // 3 = Watching
  await registerSlashCommands();
});

// ── PREFIX COMMANDS ────────────────────────────────────────
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // ?checkxp <robloxUsername>
  if (command === "checkxp") {
    const username = args[0];
    if (!username) {
      return message.reply({ embeds: [errorEmbed("Usage: `?checkxp <RobloxUsername>`")] });
    }
    try {
      const data = await apiCheckXP(username);
      message.reply({ embeds: [xpEmbed(data.username, data.xp)] });
    } catch (err) {
      message.reply({ embeds: [errorEmbed(err.message)] });
    }
  }

  // ?addxp <robloxUsername> <amount>
  else if (command === "addxp") {
    if (!hasStaffRole(message.member)) {
      return message.reply({ embeds: [errorEmbed("You don't have permission to use this command.")] });
    }
    const username = args[0];
    const amount   = parseInt(args[1], 10);
    if (!username || isNaN(amount) || amount <= 0) {
      return message.reply({ embeds: [errorEmbed("Usage: `?addxp <RobloxUsername> <amount>`")] });
    }
    try {
      const data = await apiAddXP(username, amount);
      message.reply({ embeds: [addXPEmbed(data.username, data.addedXP, data.newXP)] });
    } catch (err) {
      message.reply({ embeds: [errorEmbed(err.message)] });
    }
  }

  // ?removexp <robloxUsername> <amount>
  else if (command === "removexp") {
    if (!hasStaffRole(message.member)) {
      return message.reply({ embeds: [errorEmbed("You don't have permission to use this command.")] });
    }
    const username = args[0];
    const amount   = parseInt(args[1], 10);
    if (!username || isNaN(amount) || amount <= 0) {
      return message.reply({ embeds: [errorEmbed("Usage: `?removexp <RobloxUsername> <amount>`")] });
    }
    try {
      const data = await apiRemoveXP(username, amount);
      message.reply({ embeds: [removeXPEmbed(data.username, data.removedXP, data.newXP)] });
    } catch (err) {
      message.reply({ embeds: [errorEmbed(err.message)] });
    }
  }

  // ?rank <robloxUsername> <rank>
  else if (command === "rank") {
    if (!hasStaffRole(message.member)) {
      return message.reply({ embeds: [errorEmbed("You don't have permission to use this command.")] });
    }
    const username  = args[0];
    // rest of args form the rank name (e.g. "staff sergeant")
    const rankName  = args.slice(1).join(" ").toLowerCase();
    if (!username || !rankName) {
      return message.reply({
        embeds: [errorEmbed(`Usage: \`?rank <RobloxUsername> <rank>\`\nValid ranks: ${VALID_RANKS.join(", ")}`)],
      });
    }
    if (!VALID_RANKS.includes(rankName)) {
      return message.reply({
        embeds: [errorEmbed(`Invalid rank. Valid ranks:\n${VALID_RANKS.join(", ")}`)],
      });
    }
    try {
      await apiRank(username, rankName);
      message.reply({ embeds: [rankEmbed(username, rankName)] });
    } catch (err) {
      message.reply({ embeds: [errorEmbed(err.message)] });
    }
  }

  // ?help
  else if (command === "help") {
    const embed = new EmbedBuilder()
      .setTitle("📋 PHA Bot Commands")
      .setColor(0x5865f2)
      .addFields(
        { name: "`?checkxp <username>`",         value: "Check a user's XP",              inline: false },
        { name: "`?addxp <username> <amount>`",   value: "Add XP to a user *(staff only)*", inline: false },
        { name: "`?removexp <username> <amount>`",value: "Remove XP from a user *(staff only)*", inline: false },
        { name: "`?rank <username> <rank>`",      value: "Set a user's Roblox rank *(staff only)*", inline: false },
      )
      .setFooter({ text: "All commands also available as /slash commands" })
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
});

// ── SLASH COMMANDS ─────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  await interaction.deferReply();

  if (commandName === "checkxp") {
    const username = interaction.options.getString("username");
    try {
      const data = await apiCheckXP(username);
      await interaction.editReply({ embeds: [xpEmbed(data.username, data.xp)] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    }
  }

  else if (commandName === "addxp") {
    if (!hasStaffRole(interaction.member)) {
      return interaction.editReply({ embeds: [errorEmbed("You don't have permission to use this command.")] });
    }
    const username = interaction.options.getString("username");
    const amount   = interaction.options.getInteger("amount");
    try {
      const data = await apiAddXP(username, amount);
      await interaction.editReply({ embeds: [addXPEmbed(data.username, data.addedXP, data.newXP)] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    }
  }

  else if (commandName === "removexp") {
    if (!hasStaffRole(interaction.member)) {
      return interaction.editReply({ embeds: [errorEmbed("You don't have permission to use this command.")] });
    }
    const username = interaction.options.getString("username");
    const amount   = interaction.options.getInteger("amount");
    try {
      const data = await apiRemoveXP(username, amount);
      await interaction.editReply({ embeds: [removeXPEmbed(data.username, data.removedXP, data.newXP)] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    }
  }

  else if (commandName === "rank") {
    if (!hasStaffRole(interaction.member)) {
      return interaction.editReply({ embeds: [errorEmbed("You don't have permission to use this command.")] });
    }
    const username = interaction.options.getString("username");
    const rank     = interaction.options.getString("rank");
    try {
      await apiRank(username, rank);
      await interaction.editReply({ embeds: [rankEmbed(username, rank)] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    }
  }
});

// ── start ──────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

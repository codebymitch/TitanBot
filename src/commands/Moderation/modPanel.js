import fs from "fs";
import path from "path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { isBotOwner } from "../../config/bot.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const JAIL_STORE_PATH = path.join(DATA_DIR, "jailed_roles.json");
const CONFIG_STORE_PATH = path.join(DATA_DIR, "mod_configs.json");
const WARNS_STORE_PATH = path.join(DATA_DIR, "mod_warns.json");

function readJsonMap(filePath) {
  try {
    if (!fs.existsSync(filePath)) return new Map();
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return new Map(Object.entries(raw || {}));
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err);
    return new Map();
  }
}

function writeJsonMap(filePath, map) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const obj = Object.fromEntries(map.entries());
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error(`Failed to write ${filePath}:`, err);
  }
}

const jailedMembers = readJsonMap(JAIL_STORE_PATH);
const guildModConfigs = readJsonMap(CONFIG_STORE_PATH);
const guildWarns = readJsonMap(WARNS_STORE_PATH);

function isOwnerUser(userId, guild = null) {
  if (!userId) return false;
  if (typeof isBotOwner === "function" && isBotOwner(userId)) return true;
  if (guild?.ownerId === userId) return true;
  const envOwners = String(process.env.BOT_OWNER_IDS || process.env.OWNER_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return envOwners.includes(String(userId));
}

function isProtectedTarget(member, guild) {
  if (!member) return false;
  if (isOwnerUser(member.id, guild)) return true;
  return false;
}

function hasModPerm(member, perm, guild = null) {
  if (!member) return false;
  if (isOwnerUser(member.id, guild)) return true;
  return (
    member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions?.has(perm)
  );
}

function getJailConfig(guildId) {
  const existing = guildModConfigs.get(guildId);
  if (existing && typeof existing === "object") {
    return {
      jailRoleId: existing.jailRoleId || null,
      jailChannelId: existing.jailChannelId || null,
      autoJailEnabled:
        typeof existing.autoJailEnabled === "boolean"
          ? existing.autoJailEnabled
          : true,
      autoJailWords: Array.isArray(existing.autoJailWords)
        ? existing.autoJailWords
        : [],
    };
  }

  const defaultCfg = {
    jailRoleId: null,
    jailChannelId: null,
    autoJailEnabled: true,
    autoJailWords: [],
  };
  guildModConfigs.set(guildId, defaultCfg);
  writeJsonMap(CONFIG_STORE_PATH, guildModConfigs);
  return defaultCfg;
}

function saveJailConfig(guildId, cfg) {
  guildModConfigs.set(guildId, cfg);
  writeJsonMap(CONFIG_STORE_PATH, guildModConfigs);
}

function addUserWarning(guildId, userId, reason = "مخالفة القوانين", moderatorId = null) {
  const key = `${guildId}:${userId}`;
  const current = Array.isArray(guildWarns.get(key)) ? guildWarns.get(key) : [];
  current.push({
    reason,
    moderatorId,
    at: new Date().toISOString(),
  });
  guildWarns.set(key, current);
  writeJsonMap(WARNS_STORE_PATH, guildWarns);
  return current.length;
}

function getUserWarnings(guildId, userId) {
  const key = `${guildId}:${userId}`;
  return Array.isArray(guildWarns.get(key)) ? guildWarns.get(key) : [];
}

function normalizeArabic(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .trim();
}

function parseUserId(raw = "") {
  return String(raw).replace(/[<@!>]/g, "").trim();
}

function parseDurationMs(raw = "") {
  if (!raw) return 10 * 60 * 1000;
  const match = String(raw)
    .trim()
    .match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day)?$/i);
  if (!match) return 10 * 60 * 1000;
  const val = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  if (unit.startsWith("s")) return val * 1000;
  if (unit.startsWith("h")) return val * 60 * 60 * 1000;
  if (unit.startsWith("d")) return val * 24 * 60 * 60 * 1000;
  return val * 60 * 1000;
}

function getRestorableRoles(guild, member, savedRoleIds = []) {
  const botMember = guild.members.me;
  const botHighestPos = botMember?.roles?.highest?.position ?? 0;

  return savedRoleIds.filter((roleId) => {
    const role = guild.roles.cache.get(roleId);
    if (!role || role.managed || role.id === guild.roles.everyone.id) return false;
    if (botMember && role.position >= botHighestPos) return false;
    return true;
  });
}

async function applyJailToMember(guild, member, cfg, reason = "مخالفة القوانين") {
  const key = `${guild.id}:${member.id}`;
  const previousRoles = member.roles.cache
    .filter((r) => r.id !== guild.roles.everyone.id && r.id !== cfg.jailRoleId)
    .map((r) => r.id);

  jailedMembers.set(key, previousRoles);
  writeJsonMap(JAIL_STORE_PATH, jailedMembers);

  if (cfg.jailRoleId && guild.roles.cache.has(cfg.jailRoleId)) {
    const jailRole = guild.roles.cache.get(cfg.jailRoleId);
    const botHighestPos = guild.members.me?.roles?.highest?.position ?? 0;
    if (jailRole && !jailRole.managed && jailRole.position < botHighestPos) {
      await member.roles.set([cfg.jailRoleId], reason).catch(() => {});
    }
  }
}

async function releaseJailFromMember(guild, member, cfg, reason = "فك السجن") {
  const key = `${guild.id}:${member.id}`;
  const savedRoles = jailedMembers.get(key);
  const prevRoles = Array.isArray(savedRoles) ? savedRoles : [];
  const manageableRoles = getRestorableRoles(guild, member, prevRoles);

  if (manageableRoles.length > 0) {
    await member.roles.set(manageableRoles, reason).catch(() => {});
  } else if (cfg.jailRoleId && member.roles.cache.has(cfg.jailRoleId)) {
    await member.roles.remove(cfg.jailRoleId, reason).catch(() => {});
  }

  jailedMembers.delete(key);
  writeJsonMap(JAIL_STORE_PATH, jailedMembers);
}

export function buildModPanelEmbed(guild) {
  const cfg = getJailConfig(guild.id);
  const jailRoleText = cfg.jailRoleId ? `<@&${cfg.jailRoleId}>` : "غير محدد";
  const jailChannelText = cfg.jailChannelId ? `<#${cfg.jailChannelId}>` : "غير محدد";
  const wordsText = cfg.autoJailWords.length
    ? cfg.autoJailWords.map((w, i) => `${i + 1}. \`${w}\``).join(" ، ")
    : "لا توجد كلمات سجن تلقائي";

  return new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle("🛡️ لوحة تحكم الإشراف والسجن — سنيفر")
    .setDescription(
      "تحكم كامل بالإشراف، السجن وحفظ الرولات في ملف JSON، التحذيرات، والكلمات التلقائية من لوحة واحدة."
    )
    .addFields(
      { name: "🔒 رتبة السجن", value: jailRoleText, inline: true },
      { name: "🏠 روم السجن", value: jailChannelText, inline: true },
      {
        name: "⚡ السجن التلقائي",
        value: cfg.autoJailEnabled ? "مفعّل ✅" : "معطّل ⛔",
        inline: true,
      },
      { name: "🚨 كلمات السجن التلقائي", value: wordsText, inline: false },
      {
        name: "📌 أوامر سريعة",
        value:
          "`سجن @عضو [السبب]` • `فك_سجن @عضو`\n" +
          "`كتم @عضو [المدة]` • `تكلم @عضو`\n" +
          "`طرد @عضو [السبب]` • `باند @عضو [السبب]` • `لاباند ID`\n" +
          "`تايم @عضو [10m]` • `لاتايم @عضو`\n" +
          "`تحذير @عضو [السبب]` • `تحذيرات @عضو`\n" +
          "`مسح [1-100]` • `قفل` • `فتح` • `سجن_اعداد`",
        inline: false,
      }
    )
    .setFooter({ text: "سنيفر سيستم • الإدارة وصلاحيات الأونريه" });
}

function buildModPanelComponents(guild) {
  const cfg = getJailConfig(guild.id);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_mod_jail")
      .setLabel("سجن")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_unjail")
      .setLabel("فك سجن")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_timeout")
      .setLabel("تايم أوت")
      .setEmoji("⏳")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_warn")
      .setLabel("تحذير")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_mod_kick")
      .setLabel("طرد")
      .setEmoji("👢")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_ban")
      .setLabel("باند")
      .setEmoji("🔨")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_set_jail")
      .setLabel("إعداد السجن")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_toggle_auto")
      .setLabel(cfg.autoJailEnabled ? "إيقاف التلقائي" : "تفعيل التلقائي")
      .setEmoji("⚡")
      .setStyle(cfg.autoJailEnabled ? ButtonStyle.Secondary : ButtonStyle.Success)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_mod_add_word")
      .setLabel("إضافة كلمة تلقائية")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("snaifer_mod_clear_words")
      .setLabel("مسح الكلمات")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3];
}

export async function handleAutoJailMessage(message) {
  if (!message?.guild || message.author?.bot) return false;
  if (isOwnerUser(message.author.id, message.guild)) return false;

  const cfg = getJailConfig(message.guild.id);
  if (!cfg.autoJailEnabled || !cfg.autoJailWords?.length) return false;

  const normalizedContent = normalizeArabic(message.content || "");
  if (!normalizedContent) return false;

  const matched = cfg.autoJailWords.find((w) => {
    const clean = normalizeArabic(w);
    return clean && normalizedContent.includes(clean);
  });

  if (!matched) return false;

  const member =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));

  if (member && !isProtectedTarget(member, message.guild)) {
    await applyJailToMember(
      message.guild,
      member,
      cfg,
      `سجن تلقائي بسبب الكلمة: ${matched}`
    );
  }

  await message.delete().catch(() => {});
  await message.channel
    .send({
      content: `🔒 تم سجن ${message.author} تلقائياً بسبب مخالفة كلمة محظورة.`,
    })
    .catch(() => {});

  return true;
}

export async function handleSnaiferModInteraction(interaction) {
  if (!interaction?.guild) return false;

  if (interaction.isButton() && interaction.customId.startsWith("snaifer_mod_")) {
    if (!hasModPerm(interaction.member, PermissionFlagsBits.ModerateMembers, interaction.guild)) {
      await interaction.reply({ content: "❌ ما عندك صلاحية استخدام اللوحة.", ephemeral: true });
      return true;
    }

    const cfg = getJailConfig(interaction.guild.id);

    if (interaction.customId === "snaifer_mod_toggle_auto") {
      cfg.autoJailEnabled = !cfg.autoJailEnabled;
      saveJailConfig(interaction.guild.id, cfg);
      await interaction.update({
        embeds: [buildModPanelEmbed(interaction.guild)],
        components: buildModPanelComponents(interaction.guild),
      });
      return true;
    }

    if (interaction.customId === "snaifer_mod_clear_words") {
      cfg.autoJailWords = [];
      saveJailConfig(interaction.guild.id, cfg);
      await interaction.update({
        embeds: [buildModPanelEmbed(interaction.guild)],
        components: buildModPanelComponents(interaction.guild),
      });
      return true;
    }

    const actionMap = {
      snaifer_mod_jail: { id: "snaifer_modal_jail", title: "سجن عضو", targetLabel: "آيدي أو منشن العضو", extraLabel: "السبب (اختياري)" },
      snaifer_mod_unjail: { id: "snaifer_modal_unjail", title: "فك سجن عضو", targetLabel: "آيدي أو منشن العضو", extraLabel: "السبب (اختياري)" },
      snaifer_mod_timeout: { id: "snaifer_modal_timeout", title: "إعطاء تايم أوت", targetLabel: "آيدي أو منشن العضو", extraLabel: "المدة (مثال: 10m أو 1h)" },
      snaifer_mod_warn: { id: "snaifer_modal_warn", title: "تحذير عضو", targetLabel: "آيدي أو منشن العضو", extraLabel: "سبب التحذير" },
      snaifer_mod_kick: { id: "snaifer_modal_kick", title: "طرد عضو", targetLabel: "آيدي أو منشن العضو", extraLabel: "السبب (اختياري)" },
      snaifer_mod_ban: { id: "snaifer_modal_ban", title: "حظر عضو (باند)", targetLabel: "آيدي أو منشن العضو", extraLabel: "السبب (اختياري)" },
      snaifer_mod_set_jail: { id: "snaifer_modal_set_jail", title: "إعداد السجن", targetLabel: "آيدي رتبة السجن", extraLabel: "آيدي روم السجن (اختياري)" },
      snaifer_mod_add_word: { id: "snaifer_modal_add_word", title: "إضافة كلمة سجن تلقائي", targetLabel: "الكلمة الممنوعة", extraLabel: "ملاحظة (اختياري)" },
    };

    const meta = actionMap[interaction.customId];
    if (!meta) return false;

    const modal = new ModalBuilder().setCustomId(meta.id).setTitle(meta.title);
    const input1 = new TextInputBuilder()
      .setCustomId("mod_input_1")
      .setLabel(meta.targetLabel)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const input2 = new TextInputBuilder()
      .setCustomId("mod_input_2")
      .setLabel(meta.extraLabel)
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input1),
      new ActionRowBuilder().addComponents(input2)
    );

    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("snaifer_modal_")) {
    const val1 = interaction.fields.getTextInputValue("mod_input_1").trim();
    const val2 = interaction.fields.getTextInputValue("mod_input_2")?.trim() || "بدون سبب";
    const cfg = getJailConfig(interaction.guild.id);

    if (interaction.customId === "snaifer_modal_add_word") {
      if (val1 && !cfg.autoJailWords.includes(val1)) {
        cfg.autoJailWords.push(val1);
        saveJailConfig(interaction.guild.id, cfg);
      }
      await interaction.update({
        embeds: [buildModPanelEmbed(interaction.guild)],
        components: buildModPanelComponents(interaction.guild),
      });
      return true;
    }

    if (interaction.customId === "snaifer_modal_set_jail") {
      const roleId = parseUserId(val1);
      const channelId = val2 && val2 !== "بدون سبب" ? parseUserId(val2) : null;
      if (roleId && interaction.guild.roles.cache.has(roleId)) cfg.jailRoleId = roleId;
      if (channelId && interaction.guild.channels.cache.has(channelId)) cfg.jailChannelId = channelId;
      saveJailConfig(interaction.guild.id, cfg);

      await interaction.update({
        embeds: [buildModPanelEmbed(interaction.guild)],
        components: buildModPanelComponents(interaction.guild),
      });
      return true;
    }

    const userId = parseUserId(val1);
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (interaction.customId === "snaifer_modal_jail") {
      if (!member) {
        await interaction.reply({ content: "❌ لم يتم العثور على العضو.", ephemeral: true });
        return true;
      }
      if (isProtectedTarget(member, interaction.guild)) {
        await interaction.reply({ content: "❌ لا يمكن سجن الأونر.", ephemeral: true });
        return true;
      }
      await applyJailToMember(interaction.guild, member, cfg, val2);
      await interaction.reply({ content: `🔒 تم سجن ${member} | السبب: **${val2}**` });
      return true;
    }

    if (interaction.customId === "snaifer_modal_unjail") {
      if (!member) {
        await interaction.reply({ content: "❌ لم يتم العثور على العضو.", ephemeral: true });
        return true;
      }
      await releaseJailFromMember(interaction.guild, member, cfg, val2);
      await interaction.reply({ content: `🔓 تم فك سجن ${member} واسترجاع رولاتة.` });
      return true;
    }

    if (interaction.customId === "snaifer_modal_timeout") {
      if (!member) {
        await interaction.reply({ content: "❌ لم يتم العثور على العضو.", ephemeral: true });
        return true;
      }
      if (isProtectedTarget(member, interaction.guild)) {
        await interaction.reply({ content: "❌ لا يمكن إعطاء تايم أوت للأونر.", ephemeral: true });
        return true;
      }
      const ms = parseDurationMs(val2 === "بدون سبب" ? "10m" : val2);
      await member.timeout(ms, "تايم أوت من لوحة سنيفر");
      await interaction.reply({ content: `⏳ تم إعطاء ${member} تايم أوت.` });
      return true;
    }

    if (interaction.customId === "snaifer_modal_warn") {
      if (!member) {
        await interaction.reply({ content: "❌ لم يتم العثور على العضو.", ephemeral: true });
        return true;
      }
      if (isProtectedTarget(member, interaction.guild)) {
        await interaction.reply({ content: "❌ لا يمكن تحذير الأونر.", ephemeral: true });
        return true;
      }
      const count = addUserWarning(interaction.guild.id, member.id, val2, interaction.user.id);
      await interaction.reply({
        content: `⚠️ تم تحذير ${member} (الإجمالي: **${count}**) | السبب: **${val2}**`,
      });
      return true;
    }

    if (interaction.customId === "snaifer_modal_kick") {
      if (!member) {
        await interaction.reply({ content: "❌ لم يتم العثور على العضو.", ephemeral: true });
        return true;
      }
      if (isProtectedTarget(member, interaction.guild)) {
        await interaction.reply({ content: "❌ لا يمكن طرد الأونر.", ephemeral: true });
        return true;
      }
      await member.kick(val2);
      await interaction.reply({ content: `👢 تم طرد ${member} | السبب: **${val2}**` });
      return true;
    }

    if (interaction.customId === "snaifer_modal_ban") {
      if (isOwnerUser(userId, interaction.guild)) {
        await interaction.reply({ content: "❌ لا يمكن حظر الأونر.", ephemeral: true });
        return true;
      }
      await interaction.guild.members.ban(userId, { reason: val2 });
      await interaction.reply({ content: `🔨 تم حظر العضو \`${userId}\` | السبب: **${val2}**` });
      return true;
    }
  }

  return false;
}

export default {
  data: new SlashCommandBuilder()
    .setName("modpanel")
    .setDescription("لوحة الإشراف والسجن وأوامر الإدارة"),
  name: "modpanel",
  aliases: [
    "اوامر_سجن",
    "سجن_اعداد",
    "اعداد_السجن",
    "إعداد_السجن",
    "سجن",
    "السجن",
    "فك_سجن",
    "افراج",
    "مسح",
    "كتم",
    "اسكت",
    "تكلم",
    "انبح",
    "باند",
    "تف",
    "لاباند",
    "طرد",
    "بنعالي",
    "تايم",
    "لاتايم",
    "تحذير",
    "تحذيرات",
    "قفل",
    "فتح",
    "اشراف",
    "الاشراف",
  ],
  description: "لوحة الإشراف والسجن وأوامر الإدارة",
  async execute(messageOrInteraction, args = []) {
    const guild = messageOrInteraction.guild;
    if (!guild) return;

    const actor = messageOrInteraction.user || messageOrInteraction.author;
    const member =
      messageOrInteraction.member ||
      (actor ? await guild.members.fetch(actor.id).catch(() => null) : null);

    const content = messageOrInteraction.content ? String(messageOrInteraction.content).trim() : "";
    const firstWord = content ? content.split(/\s+/)[0].replace(/^[\$!]+/, "") : "modpanel";
    const cfg = getJailConfig(guild.id);

    const reply = async (payload) => {
      if (typeof messageOrInteraction.reply === "function") {
        return messageOrInteraction.reply(payload).catch(() => {});
      }
    };

    if (["اوامر_سجن", "اشراف", "الاشراف", "modpanel"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية فتح لوحة الإشراف.", ephemeral: true });
      }
      return reply({
        embeds: [buildModPanelEmbed(guild)],
        components: buildModPanelComponents(guild),
      });
    }

    if (["سجن_اعداد", "اعداد_السجن", "إعداد_السجن"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.Administrator, guild)) {
        return reply({ content: "❌ هذا الأمر للأونر والإدارة العليا فقط.", ephemeral: true });
      }
      const roleId = parseUserId(args[0]);
      const channelId = parseUserId(args[1]);
      if (roleId && guild.roles.cache.has(roleId)) cfg.jailRoleId = roleId;
      if (channelId && guild.channels.cache.has(channelId)) cfg.jailChannelId = channelId;
      saveJailConfig(guild.id, cfg);
      return reply({
        content: `✅ تم تحديث إعدادات السجن — الرتبة: ${cfg.jailRoleId ? `<@&${cfg.jailRoleId}>` : "غير محدد"} | الروم: ${cfg.jailChannelId ? `<#${cfg.jailChannelId}>` : "غير محدد"}`,
      });
    }

    if (["سجن", "السجن"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية السجن.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const reason = args.slice(1).join(" ") || "مخالفة القوانين";
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `سجن @عضو [السبب]`" });
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن سجن الأونر." });
      }

      await applyJailToMember(guild, target, cfg, reason);
      return reply({ content: `🔒 تم سجن ${target} | السبب: **${reason}**` });
    }

    if (["فك_سجن", "افراج"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية فك السجن.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `فك_سجن @عضو`" });

      await releaseJailFromMember(guild, target, cfg, "فك السجن");
      return reply({ content: `🔓 تم الإفراج عن ${target} واسترجاع رولاتة.` });
    }

    if (["كتم", "اسكت", "انبح"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية الكتم.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `كتم @عضو [المدة]`" });
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن كتم الأونر." });
      }
      const ms = parseDurationMs(args[1] || "10m");
      await target.timeout(ms, "كتم").catch(() => {});
      return reply({ content: `🔇 تم كتم ${target}.` });
    }

    if (["تكلم"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية فك الكتم.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `تكلم @عضو`" });
      await target.timeout(null, "فك الكتم").catch(() => {});
      return reply({ content: `🔊 تم فك الكتم عن ${target}.` });
    }

    if (["طرد", "بنعالي"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.KickMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية الطرد.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const reason = args.slice(1).join(" ") || "بدون سبب";
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `طرد @عضو [السبب]`" });
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن طرد الأونر." });
      }
      await target.kick(reason).catch(() => {});
      return reply({ content: `👢 تم طرد ${target} | السبب: **${reason}**` });
    }

    if (["باند", "تف"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.BanMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية الباند.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const reason = args.slice(1).join(" ") || "بدون سبب";
      if (!targetId) return reply({ content: "❌ حدد عضو أو آيدي: `باند @عضو [السبب]`" });
      if (isOwnerUser(targetId, guild)) {
        return reply({ content: "❌ لا يمكن حظر الأونر." });
      }
      await guild.members.ban(targetId, { reason }).catch(() => {});
      return reply({ content: `🔨 تم حظر \`${targetId}\` | السبب: **${reason}**` });
    }

    if (["لاباند"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.BanMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية فك الباند.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      if (!targetId) return reply({ content: "❌ حدد آيدي العضو: `لاباند ID`" });
      await guild.members.unban(targetId, "فك الباند").catch(() => {});
      return reply({ content: `✅ تم فك الحظر عن \`${targetId}\`.` });
    }

    if (["تايم"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية التايم أوت.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `تايم @عضو [10m]`" });
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن إعطاء تايم أوت للأونر." });
      }
      const ms = parseDurationMs(args[1] || "10m");
      await target.timeout(ms, "تايم أوت").catch(() => {});
      return reply({ content: `⏳ تم إعطاء ${target} تايم أوت.` });
    }

    if (["لاتايم"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية إزالة التايم أوت.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `لاتايم @عضو`" });
      await target.timeout(null, "إزالة التايم أوت").catch(() => {});
      return reply({ content: `✅ تم إزالة التايم أوت عن ${target}.` });
    }

    if (["تحذير"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية التحذير.", ephemeral: true });
      }
      const targetId = parseUserId(args[0]);
      const reason = args.slice(1).join(" ") || "مخالفة القوانين";
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) return reply({ content: "❌ حدد عضو صحيح: `تحذير @عضو [السبب]`" });
      if (isProtectedTarget(target, guild)) {
        return reply({ content: "❌ لا يمكن تحذير الأونر." });
      }
      const count = addUserWarning(guild.id, target.id, reason, actor?.id || null);
      return reply({ content: `⚠️ تم تحذير ${target} (الإجمالي: **${count}**) | السبب: **${reason}**` });
    }

    if (["تحذيرات"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ModerateMembers, guild)) {
        return reply({ content: "❌ ما عندك صلاحية عرض التحذيرات.", ephemeral: true });
      }
      const targetId = parseUserId(args[0] || actor?.id);
      const warns = getUserWarnings(guild.id, targetId);
      if (!warns.length) {
        return reply({ content: `ℹ️ لا توجد تحذيرات مسجلة للعضو <@${targetId}>.` });
      }
      const list = warns
        .map((w, idx) => `${idx + 1}. **${w.reason}**`)
        .join("\n");
      return reply({ content: `⚠️ تحذيرات <@${targetId}> (**${warns.length}**):\n${list}` });
    }

    if (["مسح"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ManageMessages, guild)) {
        return reply({ content: "❌ ما عندك صلاحية مسح الرسائل.", ephemeral: true });
      }
      const count = Math.min(Math.max(Number(args[0]) || 10, 1), 100);
      const deleted = await messageOrInteraction.channel?.bulkDelete(count, true).catch(() => null);
      return reply({ content: `🧹 تم مسح **${deleted?.size ?? 0}** رسالة.` });
    }

    if (["قفل"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ManageChannels, guild)) {
        return reply({ content: "❌ ما عندك صلاحية قفل الروم.", ephemeral: true });
      }
      await messageOrInteraction.channel?.permissionOverwrites
        .edit(guild.roles.everyone.id, { SendMessages: false })
        .catch(() => {});
      return reply({ content: "🔒 تم قفل الروم." });
    }

    if (["فتح"].includes(firstWord)) {
      if (!hasModPerm(member, PermissionFlagsBits.ManageChannels, guild)) {
        return reply({ content: "❌ ما عندك صلاحية فتح الروم.", ephemeral: true });
      }
      await messageOrInteraction.channel?.permissionOverwrites
        .edit(guild.roles.everyone.id, { SendMessages: true })
        .catch(() => {});
      return reply({ content: "🔓 تم فتح الروم." });
    }

    return reply({
      embeds: [buildModPanelEmbed(guild)],
      components: buildModPanelComponents(guild),
    });
  },
};

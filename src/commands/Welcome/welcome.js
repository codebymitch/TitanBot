import fs from "fs";
import path from "path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  ModalBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const WELCOME_STORE_PATH = path.resolve(process.cwd(), "data", "welcome_configs.json");

function readWelcomeStore() {
  try {
    if (!fs.existsSync(WELCOME_STORE_PATH)) return new Map();
    const raw = JSON.parse(fs.readFileSync(WELCOME_STORE_PATH, "utf8"));
    return new Map(Object.entries(raw || {}));
  } catch (err) {
    console.error("Failed to load welcome configs:", err);
    return new Map();
  }
}

function writeWelcomeStore(map) {
  try {
    fs.mkdirSync(path.dirname(WELCOME_STORE_PATH), { recursive: true });
    const obj = Object.fromEntries(map.entries());
    fs.writeFileSync(WELCOME_STORE_PATH, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save welcome configs:", err);
  }
}

const welcomeConfigs = readWelcomeStore();

function getWelcomeConfig(guildId) {
  const existing = welcomeConfigs.get(guildId);
  if (existing && typeof existing === "object") {
    return {
      enabled: typeof existing.enabled === "boolean" ? existing.enabled : true,
      channelId: existing.channelId || null,
      title: existing.title || "أهلاً بك في السيرفر",
      message:
        existing.message ||
        "حياك الله يا {user} في **{server}**! أنت العضو رقم **{count}**.",
      autoRoleId: existing.autoRoleId || null,
    };
  }

  const defaultCfg = {
    enabled: true,
    channelId: null,
    title: "أهلاً بك في السيرفر",
    message:
      "حياك الله يا {user} في **{server}**! أنت العضو رقم **{count}**.",
    autoRoleId: null,
  };
  welcomeConfigs.set(guildId, defaultCfg);
  writeWelcomeStore(welcomeConfigs);
  return defaultCfg;
}

function saveWelcomeConfig(guildId, cfg) {
  welcomeConfigs.set(guildId, cfg);
  writeWelcomeStore(welcomeConfigs);
}

function formatWelcomeTemplate(template, member) {
  const guild = member.guild;
  return String(template || "")
    .replace(/\{user\}/gi, `${member}`)
    .replace(/\{username\}/gi, member.user?.username || "عضو")
    .replace(/\{tag\}/gi, member.user?.tag || member.user?.username || "عضو")
    .replace(/\{id\}/gi, member.id)
    .replace(/\{server\}/gi, guild?.name || "السيرفر")
    .replace(/\{count\}/gi, String(guild?.memberCount || 0));
}

function hasAdminOrManageGuild(member) {
  if (!member) return false;
  return (
    member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions?.has(PermissionsBitField.Flags.ManageGuild)
  );
}

export function buildWelcomeEmbed(guild, member = null) {
  const cfg = getWelcomeConfig(guild.id);
  const channelText = cfg.channelId ? `<#${cfg.channelId}>` : "غير محدد";
  const autoRoleText = cfg.autoRoleId ? `<@&${cfg.autoRoleId}>` : "غير محدد";

  const previewMember = member || guild.members.me;
  const previewText = previewMember
    ? formatWelcomeTemplate(cfg.message, previewMember)
    : cfg.message;

  return new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle(`👋 لوحة تحكم الترحيب — ${guild.name}`)
    .setDescription(
      "تحكم في روم الترحيب، رسالة الترحيب، والرتبة التلقائية من لوحة واحدة."
    )
    .addFields(
      {
        name: "📌 الحالة",
        value: cfg.enabled ? "مفعّل ✅" : "معطّل ⛔",
        inline: true,
      },
      { name: "💬 روم الترحيب", value: channelText, inline: true },
      { name: "🎭 رتبة تلقائية", value: autoRoleText, inline: true },
      { name: "📝 عنوان الإيمبد", value: `\`${cfg.title}\``, inline: false },
      { name: "💬 معاينة رسالة الترحيب", value: previewText, inline: false },
      {
        name: "🔑 المتغيرات المتاحة",
        value:
          "`{user}` منشن العضو • `{username}` اسم العضو • `{server}` اسم السيرفر • `{count}` عدد الأعضاء",
        inline: false,
      }
    )
    .setFooter({ text: "سنيفر سيستم • نظام الترحيب" });
}

function buildWelcomePanelComponents(guild) {
  const cfg = getWelcomeConfig(guild.id);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_wel_toggle")
      .setLabel(cfg.enabled ? "إيقاف الترحيب" : "تفعيل الترحيب")
      .setEmoji(cfg.enabled ? "⛔" : "✅")
      .setStyle(cfg.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("snaifer_wel_channel_role")
      .setLabel("تحديد الروم والرتبة")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("snaifer_wel_message")
      .setLabel("تعديل الرسالة")
      .setEmoji("✍️")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("snaifer_wel_preview")
      .setLabel("تجربة إرسال ترحيب")
      .setEmoji("📨")
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

export function buildWelcomeMemberEmbed(member) {
  const cfg = getWelcomeConfig(member.guild.id);
  const formattedDesc = formatWelcomeTemplate(cfg.message, member);
  const formattedTitle = formatWelcomeTemplate(cfg.title, member);

  return new EmbedBuilder()
    .setColor("#2B2D31")
    .setTitle(formattedTitle)
    .setDescription(formattedDesc)
    .setThumbnail(member.user?.displayAvatarURL?.({ size: 256 }) || null)
    .addFields(
      { name: "👤 العضو", value: `${member.user?.tag || member.id}`, inline: true },
      { name: "👥 عدد الأعضاء", value: `${member.guild.memberCount}`, inline: true }
    )
    .setTimestamp();
}

export async function handleGuildMemberAddWelcome(member) {
  if (!member?.guild || member.user?.bot) return;

  const cfg = getWelcomeConfig(member.guild.id);
  if (!cfg.enabled) return;

  if (cfg.autoRoleId && member.guild.roles.cache.has(cfg.autoRoleId)) {
    const role = member.guild.roles.cache.get(cfg.autoRoleId);
    if (role && !role.managed) {
      await member.roles.add(role, "رتبة ترحيب تلقائية").catch(() => {});
    }
  }

  if (!cfg.channelId) return;
  const channel =
    member.guild.channels.cache.get(cfg.channelId) ||
    (await member.guild.channels.fetch(cfg.channelId).catch(() => null));

  if (!channel || typeof channel.send !== "function") return;

  await channel
    .send({
      content: `${member}`,
      embeds: [buildWelcomeMemberEmbed(member)],
    })
    .catch(() => {});
}

export async function handleSnaiferWelcomeInteraction(interaction) {
  if (!interaction?.guild) return false;

  if (interaction.isButton() && interaction.customId.startsWith("snaifer_wel_")) {
    if (!hasAdminOrManageGuild(interaction.member)) {
      await interaction.reply({
        content: "❌ هذا القسم مخصص للإدارة فقط.",
        ephemeral: true,
      });
      return true;
    }

    const cfg = getWelcomeConfig(interaction.guild.id);

    if (interaction.customId === "snaifer_wel_toggle") {
      cfg.enabled = !cfg.enabled;
      saveWelcomeConfig(interaction.guild.id, cfg);
      await interaction.update({
        embeds: [buildWelcomeEmbed(interaction.guild, interaction.member)],
        components: buildWelcomePanelComponents(interaction.guild),
      });
      return true;
    }

    if (interaction.customId === "snaifer_wel_preview") {
      const targetChannel = cfg.channelId
        ? interaction.guild.channels.cache.get(cfg.channelId)
        : interaction.channel;

      if (!targetChannel || typeof targetChannel.send !== "function") {
        await interaction.reply({
          content: "❌ حدد روم الترحيب أولاً.",
          ephemeral: true,
        });
        return true;
      }

      await targetChannel.send({
        content: `${interaction.member}`,
        embeds: [buildWelcomeMemberEmbed(interaction.member)],
      });

      await interaction.reply({
        content: `✅ تم إرسال معاينة الترحيب في ${targetChannel}.`,
        ephemeral: true,
      });
      return true;
    }

    if (interaction.customId === "snaifer_wel_channel_role") {
      const modal = new ModalBuilder()
        .setCustomId("snaifer_modal_wel_channel_role")
        .setTitle("تحديد روم الترحيب والرتبة");

      const channelInput = new TextInputBuilder()
        .setCustomId("wel_channel_id")
        .setLabel("آيدي روم الترحيب (أو اتركه فارغاً)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(cfg.channelId || "");

      const roleInput = new TextInputBuilder()
        .setCustomId("wel_role_id")
        .setLabel("آيدي الرتبة التلقائية (اختياري)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(cfg.autoRoleId || "");

      modal.addComponents(
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(roleInput)
      );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === "snaifer_wel_message") {
      const modal = new ModalBuilder()
        .setCustomId("snaifer_modal_wel_message")
        .setTitle("تعديل رسالة الترحيب");

      const titleInput = new TextInputBuilder()
        .setCustomId("wel_title")
        .setLabel("عنوان الإيمبد")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(cfg.title);

      const descInput = new TextInputBuilder()
        .setCustomId("wel_message")
        .setLabel("نص رسالة الترحيب")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(cfg.message);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput)
      );

      await interaction.showModal(modal);
      return true;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("snaifer_modal_wel_")) {
    const cfg = getWelcomeConfig(interaction.guild.id);

    if (interaction.customId === "snaifer_modal_wel_channel_role") {
      const rawChannel = interaction.fields.getTextInputValue("wel_channel_id").replace(/[<#>]/g, "").trim();
      const rawRole = interaction.fields.getTextInputValue("wel_role_id").replace(/[<@&>]/g, "").trim();

      cfg.channelId = rawChannel && interaction.guild.channels.cache.has(rawChannel) ? rawChannel : null;
      cfg.autoRoleId = rawRole && interaction.guild.roles.cache.has(rawRole) ? rawRole : null;

      saveWelcomeConfig(interaction.guild.id, cfg);
      await interaction.update({
        embeds: [buildWelcomeEmbed(interaction.guild, interaction.member)],
        components: buildWelcomePanelComponents(interaction.guild),
      });
      return true;
    }

    if (interaction.customId === "snaifer_modal_wel_message") {
      const newTitle = interaction.fields.getTextInputValue("wel_title").trim();
      const newMsg = interaction.fields.getTextInputValue("wel_message").trim();

      if (newTitle) cfg.title = newTitle;
      if (newMsg) cfg.message = newMsg;

      saveWelcomeConfig(interaction.guild.id, cfg);
      await interaction.update({
        embeds: [buildWelcomeEmbed(interaction.guild, interaction.member)],
        components: buildWelcomePanelComponents(interaction.guild),
      });
      return true;
    }
  }

  return false;
}

export default {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("لوحة تحكم نظام الترحيب"),
  name: "welcome",
  aliases: ["ترحيب", "الترحيب", "اعداد_الترحيب", "لوحة_الترحيب"],
  description: "لوحة تحكم نظام الترحيب",
  async execute(messageOrInteraction) {
    const guild = messageOrInteraction.guild;
    if (!guild) return;

    const member = messageOrInteraction.member;
    if (!hasAdminOrManageGuild(member)) {
      if (typeof messageOrInteraction.reply === "function") {
        return messageOrInteraction
          .reply({ content: "❌ هذا الأمر مخصص للإدارة فقط.", ephemeral: true })
          .catch(() => {});
      }
      return;
    }

    if (typeof messageOrInteraction.reply === "function") {
      return messageOrInteraction
        .reply({
          embeds: [buildWelcomeEmbed(guild, member)],
          components: buildWelcomePanelComponents(guild),
        })
        .catch(() => {});
    }
  },
};

import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
const BUG_REPORT_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1451105773198508073/g7EQbcGS9lIkmi53LNbbNjMQq4nL9ZJjM5LwAKW6TpirxHzghuxmRKXt6US_II76Kl4L";

  export default {
    data: new SlashCommandBuilder()
    .setName("bug")
    .setDescription("Report a bug or issue with the bot")
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Describe the bug or issue in detail")
        .setRequired(true),
    )
    .addAttachmentOption((option) =>
      option
        .setName("screenshot")
        .setDescription("(Optional) Attach a screenshot of the issue"),
    ),

  async execute(interaction) {
const description = interaction.options.getString("description");
    const screenshot = interaction.options.getAttachment("screenshot");
    const reporter = interaction.user;

    // Create embed for the bug report
    const bugReportEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🐛 Bug Report")
      .setDescription(description)
      .addFields(
        {
          name: "Reported by",
          value: `${reporter.tag} (${reporter.id})`,
          inline: true,
        },
        {
          name: "Server",
          value: `${interaction.guild?.name || "DM"} (${interaction.guildId || "N/A"})`,
          inline: true,
        },
        {
          name: "Channel",
          value: interaction.channel?.toString() || "DM",
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({ text: `User ID: ${reporter.id}` });

    // Add screenshot if provided
    if (screenshot) {
      if (screenshot.contentType?.startsWith("image/")) {
        bugReportEmbed.setImage(screenshot.url);
      } else {
        await interaction.followUp({
          content:
            "⚠️ The attached file is not a valid image. The bug report was sent without the attachment.",
          flags: ["Ephemeral"],
        });
      }
    }

    try {
      // Create webhook client and send the bug report
      const webhookClient = new WebhookClient({ url: BUG_REPORT_WEBHOOK_URL });

      await webhookClient.send({
        content: "New bug report submitted:",
        username: "Bug Report System",
        avatarURL: interaction.client.user.displayAvatarURL(),
        embeds: [bugReportEmbed],
      });

      // Destroy the webhook client to clean up
      webhookClient.destroy();

      // Confirm to the user
      await interaction.followUp({
        content:
          "✅ Thank you for your bug report! It has been submitted to the developers.",
        flags: ["Ephemeral"],
      });
    } catch (error) {
      console.error("Error sending bug report:", error);
      await interaction.followUp({
        content:
          "❌ There was an error submitting your bug report. Please try again later or contact support directly.",
        flags: ["Ephemeral"],
      });
    }
  },
};

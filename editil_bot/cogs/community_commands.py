from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import PURPLE, embed, error, success
from .community import RolePanel


class CommunityCommands(commands.Cog):
    def __init__(self, bot: commands.Bot): self.bot = bot

    async def _send_to_configured(self, interaction: discord.Interaction, key: str, title: str, content: str) -> None:
        channel_id = int(await self.bot.db.get_guild_setting(interaction.guild_id, key, 0) or 0)
        channel = interaction.guild.get_channel(channel_id) if interaction.guild else None
        if not isinstance(channel, discord.TextChannel):
            await interaction.response.send_message(embed=error("המערכת עדיין לא הוגדרה. בעל השרת יכול להשתמש ב־`/setup`."), ephemeral=True); return
        await channel.send(embed=embed(title, f"**מאת:** {interaction.user.mention}\n{content}", PURPLE))
        await interaction.response.send_message(embed=success("הפנייה נשלחה בהצלחה."), ephemeral=True)

    @app_commands.command(name="suggest", description="שליחת הצעה לקהילה")
    async def suggest(self, interaction: discord.Interaction, suggestion: str) -> None:
        await self._send_to_configured(interaction, "suggestions_channel_id", "💡 הצעה חדשה", suggestion)

    @app_commands.command(name="report", description="דיווח פרטי לצוות")
    async def report(self, interaction: discord.Interaction, member: discord.Member, reason: str) -> None:
        await self._send_to_configured(interaction, "reports_channel_id", "🚨 דיווח חדש", f"**משתמש:** {member.mention}\n**סיבה:** {reason}")

    @app_commands.command(name="feedback", description="שליחת משוב")
    async def feedback(self, interaction: discord.Interaction, message: str) -> None:
        key = "suggestions_channel_id"
        await self._send_to_configured(interaction, key, "📝 משוב חדש", message)

    @app_commands.command(name="poll", description="יצירת סקר")
    async def poll(self, interaction: discord.Interaction, question: str, option_one: str, option_two: str) -> None:
        card = embed("📊 " + question, f"1️⃣ {option_one}\n2️⃣ {option_two}\n\nנוצר על ידי {interaction.user.mention}", PURPLE)
        await interaction.response.send_message(embed=card)
        message = await interaction.original_response()
        await message.add_reaction("1️⃣"); await message.add_reaction("2️⃣")

    @app_commands.command(name="roles", description="בחירת תפקידי עריכה")
    async def roles(self, interaction: discord.Interaction) -> None:
        community = self.bot.get_cog("Community")
        await interaction.response.send_message("בחרו את התפקידים המתאימים לכם:", view=RolePanel(community), ephemeral=True)

    @app_commands.command(name="rolepanel", description="פרסום לוח בחירת תפקידים")
    @app_commands.checks.has_permissions(manage_roles=True)
    async def rolepanel(self, interaction: discord.Interaction) -> None:
        community = self.bot.get_cog("Community")
        await interaction.response.send_message(embed=embed("🎭 בחירת תפקידים", "בחרו מהרשימות את תחומי העריכה שלכם.", PURPLE), view=RolePanel(community))


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(CommunityCommands(bot))

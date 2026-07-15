from __future__ import annotations

from urllib.parse import urlparse

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import PURPLE, embed


class Showcase(commands.Cog):
    def __init__(self, bot: commands.Bot): self.bot = bot

    @app_commands.command(name="showcase", description="פרסום עריכה חדשה ב־Showcase")
    @app_commands.describe(software="תוכנת העריכה", category="קטגוריית היצירה", link="קישור לעריכה")
    async def showcase(self, interaction: discord.Interaction, software: str, category: str, link: str) -> None:
        parsed = urlparse(link)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            await interaction.response.send_message("⚠️ יש לשלוח קישור תקין שמתחיל ב־https:// או http://.", ephemeral=True)
            return
        description = f"**יוצר/ת:** {interaction.user.mention}\n**תוכנה:** {software}\n**קטגוריה:** {category}\n**צפייה:** [לחצו כאן]({link})\n\n**לייקים:** ❤️ 0"
        await interaction.response.send_message(embed=embed("🎬 עריכה חדשה", description, PURPLE))
        message = await interaction.original_response()
        await message.add_reaction("❤️")
        await self.bot.db.execute("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)", (interaction.user.id,))
        await self.bot.db.execute("UPDATE profiles SET edits = edits + 1, software = ? WHERE user_id = ?", (software, interaction.user.id))
        await self.bot.db.add_xp(interaction.user.id, 15)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Showcase(bot))

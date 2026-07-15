from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import PURPLE, embed, success


class Utility(commands.Cog):
    def __init__(self, bot: commands.Bot): self.bot = bot

    @app_commands.command(name="embed", description="שליחת הודעת Embed")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def embed_command(self, interaction: discord.Interaction, channel: discord.TextChannel, title: str, description: str) -> None:
        await interaction.response.defer(ephemeral=True)
        await channel.send(embed=embed(title, description, PURPLE))
        await interaction.followup.send(embed=success(f"ההודעה נשלחה ל־{channel.mention}."), ephemeral=True)

    @app_commands.command(name="announce", description="פרסום הודעה רשמית")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def announce(self, interaction: discord.Interaction, channel: discord.TextChannel, message: str) -> None:
        await interaction.response.defer(ephemeral=True)
        sent = await channel.send(embed=embed("📣 הודעה", message, PURPLE))
        await interaction.followup.send(embed=success(f"ההודעה פורסמה: {sent.jump_url}"), ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Utility(bot))

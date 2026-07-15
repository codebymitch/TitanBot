from __future__ import annotations

import discord

BLUE = discord.Colour.from_rgb(88, 101, 242)
PURPLE = discord.Colour.from_rgb(155, 89, 182)
RED = discord.Colour.red()
GREEN = discord.Colour.green()


def embed(title: str, description: str = "", colour: discord.Colour = BLUE) -> discord.Embed:
    return discord.Embed(title=title, description=description, colour=colour, timestamp=discord.utils.utcnow())


def success(description: str) -> discord.Embed:
    return embed("✅ בוצע", description, GREEN)


def error(description: str) -> discord.Embed:
    return embed("⚠️ שגיאה", description, RED)

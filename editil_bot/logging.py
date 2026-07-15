from __future__ import annotations

import discord
from .embeds import PURPLE, embed


async def log(guild: discord.Guild, channel_id: int, title: str, description: str) -> None:
    channel = guild.get_channel(channel_id)
    if isinstance(channel, discord.TextChannel):
        await channel.send(embed=embed(title, description, PURPLE))

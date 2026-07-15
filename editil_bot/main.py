from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import discord
from discord.ext import commands
from dotenv import load_dotenv

from .config import Settings
from .database import Database

load_dotenv(".env.editil")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class EditILBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.members = True
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents)
        self.settings = Settings.from_environment()
        self.db = Database("/app/data/editil.db" if Path("/app").exists() else "editil.db")

    async def setup_hook(self) -> None:
        await self.db.connect()
        for path in Path(__file__).parent.joinpath("cogs").glob("*.py"):
            if path.stem != "__init__":
                await self.load_extension(f"editil_bot.cogs.{path.stem}")
        if self.settings.guild_id:
            guild = discord.Object(id=self.settings.guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()

    async def close(self) -> None:
        await self.db.close()
        await super().close()


async def run() -> None:
    bot = EditILBot()
    if not bot.settings.token:
        raise RuntimeError("DISCORD_TOKEN חסר בקובץ .env.editil")
    async with bot:
        await bot.start(bot.settings.token)


if __name__ == "__main__":
    asyncio.run(run())

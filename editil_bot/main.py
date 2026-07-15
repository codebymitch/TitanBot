from __future__ import annotations

import asyncio
import logging
from collections import Counter
from pathlib import Path

import discord
from discord.ext import commands
from dotenv import load_dotenv

from .config import Settings
from .database import Database

load_dotenv(".env.editil")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


class EditILBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.members = True
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents)
        self.settings = Settings.from_environment()
        self.db = Database("/app/data/editil.db" if Path("/app").exists() else "editil.db")
        self.loaded_modules: list[str] = []
        self.failed_modules: dict[str, str] = {}
        self.registered_command_count = 0
        self.last_error_reference: str | None = None

    async def load_cogs(self) -> None:
        """Load every cog independently so one failure does not hide the rest."""
        cog_directory = Path(__file__).parent / "cogs"
        for path in sorted(cog_directory.glob("*.py")):
            if path.stem == "__init__":
                continue

            extension = f"editil_bot.cogs.{path.stem}"
            try:
                await self.load_extension(extension)
            except Exception as exc:
                self.failed_modules[extension] = f"{type(exc).__name__}: {exc}"
                logger.exception("Failed to load extension %s", extension)
            else:
                self.loaded_modules.append(extension)
                logger.info("Loaded extension %s", extension)

    def validate_command_tree(self) -> None:
        """Fail before syncing if Discord would receive duplicate command paths."""
        command_names = [command.qualified_name for command in self.tree.walk_commands()]
        duplicates = sorted(name for name, count in Counter(command_names).items() if count > 1)
        if duplicates:
            raise RuntimeError(f"Duplicate application command paths: {', '.join(duplicates)}")

    async def setup_hook(self) -> None:
        await self.db.connect()
        await self.load_cogs()
        self.validate_command_tree()

        logger.info(
            "Extension loading complete: %d loaded, %d failed",
            len(self.loaded_modules),
            len(self.failed_modules),
        )
        if self.settings.guild_id:
            guild = discord.Object(id=self.settings.guild_id)
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            logger.info(
                "Development sync completed: %d commands registered to guild %d",
                len(synced),
                self.settings.guild_id,
            )
        else:
            synced = await self.tree.sync()
            logger.info(
                "Production sync completed: %d global commands registered; global updates may take longer to appear",
                len(synced),
            )
        self.registered_command_count = len(synced)

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

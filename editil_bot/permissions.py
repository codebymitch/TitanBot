from __future__ import annotations

from collections.abc import Callable
from typing import Any

import discord
from discord import app_commands


LEVEL_KEYS = {
    "verified": "verified_role_id",
    "helper": "helper_role_id",
    "moderator": "moderator_role_id",
    "administrator": "administrator_role_id",
}


async def configured_role_id(interaction: discord.Interaction, level: str) -> int:
    if not interaction.guild_id:
        return 0
    key = LEVEL_KEYS[level]
    value = await interaction.client.db.get_guild_setting(interaction.guild_id, key, 0)
    if not value and level == "verified":
        value = interaction.client.settings.member_role_id
    if not value and level == "helper":
        value = interaction.client.settings.ticket_staff_role_id
    return int(value or 0)


def server_owner_only() -> Callable[[Any], Any]:
    async def predicate(interaction: discord.Interaction) -> bool:
        if not interaction.guild or interaction.user.id != interaction.guild.owner_id:
            raise app_commands.CheckFailure("server_owner_only")
        return True
    return app_commands.check(predicate)


def permission_level(level: str) -> Callable[[Any], Any]:
    async def predicate(interaction: discord.Interaction) -> bool:
        if not interaction.guild or not isinstance(interaction.user, discord.Member):
            raise app_commands.CheckFailure("guild_only")
        permissions = interaction.user.guild_permissions
        if interaction.user.id == interaction.guild.owner_id:
            return True
        native = {
            "verified": False,
            "helper": False,
            "moderator": permissions.moderate_members or permissions.manage_messages,
            "administrator": permissions.administrator or permissions.manage_guild,
        }[level]
        role_id = await configured_role_id(interaction, level)
        if native or (role_id and interaction.user.get_role(role_id)):
            return True
        raise app_commands.MissingPermissions([level])
    return app_commands.check(predicate)


def target_is_manageable(actor: discord.Member, target: discord.Member, bot_member: discord.Member) -> bool:
    if target.id == target.guild.owner_id or target.id == actor.id:
        return False
    if target.guild_permissions.administrator:
        return False
    if actor.id != actor.guild.owner_id and target.top_role >= actor.top_role:
        return False
    return target.top_role < bot_member.top_role

from __future__ import annotations

import os
from dataclasses import dataclass


def _integer(name: str, default: int = 0) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    token: str
    guild_id: int
    welcome_channel_id: int
    rules_channel_id: int
    log_channel_id: int
    ticket_category_id: int
    ticket_staff_role_id: int
    new_member_role_id: int
    member_role_id: int
    booster_role_id: int
    booster_channel_id: int
    winners_channel_id: int
    allowed_link_channels: set[int]
    bad_words: set[str]

    @classmethod
    def from_environment(cls) -> "Settings":
        links = {int(value) for value in os.getenv("LINKS_ALLOWED_CHANNEL_IDS", "").split(",") if value.strip().isdigit()}
        words = {word.strip().casefold() for word in os.getenv("BAD_WORDS", "").split(",") if word.strip()}
        return cls(
            token=os.getenv("DISCORD_TOKEN", ""), guild_id=_integer("GUILD_ID"),
            welcome_channel_id=_integer("WELCOME_CHANNEL_ID"), rules_channel_id=_integer("RULES_CHANNEL_ID"),
            log_channel_id=_integer("LOG_CHANNEL_ID"), ticket_category_id=_integer("TICKET_CATEGORY_ID"),
            ticket_staff_role_id=_integer("TICKET_STAFF_ROLE_ID"), new_member_role_id=_integer("NEW_MEMBER_ROLE_ID"),
            member_role_id=_integer("MEMBER_ROLE_ID"), booster_role_id=_integer("BOOSTER_ROLE_ID"),
            booster_channel_id=_integer("BOOSTER_CHANNEL_ID"), winners_channel_id=_integer("WINNERS_CHANNEL_ID"),
            allowed_link_channels=links, bad_words=words,
        )

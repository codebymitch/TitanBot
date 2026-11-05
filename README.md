# Milano Roleplay Discord Bot

This repository contains the Milano Roleplay Discord bot, built with Node.js, discord.js, and PostgreSQL.

## Features

The bot supports moderation, tickets, applications, leveling, giveaways, birthdays, server statistics, reaction roles, search and utility tools, verification, welcome messages, and logging. The economy, fun/game commands, Join-to-Create voice-channel automation, and music playback features have been removed.

## Setup

1. Install Node.js 20.10 or later and PostgreSQL.
2. Copy `.env.example` to `.env` and configure `DISCORD_TOKEN`, `CLIENT_ID`, and your PostgreSQL connection variables.
3. Install dependencies with `npm install`.
4. Start the bot using `npm start`.

For Docker deployment, use `docker compose up -d --build` after configuring `.env`.

## Commands

Use `/help` in Discord to browse commands currently loaded by the bot. Commands and their slash-command registrations are generated from the remaining command modules at startup.

## Support

Discord: https://discord.gg/mlroleplay

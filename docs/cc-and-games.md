# Chaos Credits (CC) and games

> **The games moved to a separate games bot (Clover).** This bot keeps the CC system (`cc`,
> `cctop`, the live Top CC board, the store) and pays [Clover wins](#clover-wins); a games bot you
> control can also use the [CC API](#cc-api-for-the-games-bot). This bot's own games are **off** but not deleted: every
> file below is still in the repo, and `GAMES_ENABLED=true` + a restart brings them all back
> (`src/config/games.js`). While they are off the game commands (`game`, `solo`, `rps`, `xo`,
> `fight`) are not loaded, registered or listed in `help`, the games channel no longer deletes
> other messages, and the buttons of an old games panel say the games moved. The rest of this
> page describes the games as they work when switched back on.

CC is the server's only currency and it is earned from games only: [Clover wins](#clover-wins),
and this bot's own games when they are switched back on (group games pay the top 3, solo games pay
a little, with a daily cap only during a CC event). There is no `daily`.

The old ways to earn coins (daily, work, crime, rob, beg, fish, mine, gamble, slut, pay) and the old
bank/shop/inventory commands were removed. Members can send CC to each other with
[`give`](#sending-cc-give), which takes a tax. Staff can still add or remove CC by hand from
`/economy dashboard`.

All numbers live in `src/config/cc.js`.

## Rewards

Group games: the pool is `10 CC × players` (counting up to 30 players), split 50% / 30% / 20%
between 1st, 2nd and 3rd. A game pays fewer places than it has players, so a 2 player game only
pays the winner.

| Players | 🥇 | 🥈 | 🥉 |
|---|---|---|---|
| 2 | 10 | – | – |
| 3 | 15 | 9 | – |
| 5 | 25 | 15 | 10 |
| 10 | 50 | 30 | 20 |
| 30+ | 150 | 90 | 60 |

Solo games (`سؤال`, `رقم`, `سلوت`, `حجر`, `اكس`): 5 CC per win (×5 during a CC event). During a CC event a member can earn at most 1,500 CC a day (UTC) from solo games; outside an event there is no daily cap.

Games against another member (`اكس @عضو`, `fight @عضو`) start with an invite: the other member has
20 seconds to press قبول or رفض (the challenger can take it back with رفض). Only after قبول does the
game start; a refused, cancelled or unanswered invite is deleted after 5 seconds.

## Commands

Every command works as a slash command and as a word typed in chat (with or without the prefix).
Game words typed without the prefix only start a game when the message is just that word
(optionally followed by a number or a mention), so normal chat like `سؤال يا جماعة` is ignored.

| Chat word | Slash | What it does |
|---|---|---|
| `رصيد` / `cc` / `bal` | `/cc [user]` | CC balance, rank and game stats (reply to a message to see that member's) |
| `top cc` / `توب cc` / `cctop` | `/cctop` | CC leaderboard |
| `تحويل @member 100` / `cc give @member 100` / `give` | `/give user amount` | Send CC to a member, minus a tax (see below) |
| `addcc 500` / `addcc @member 500` / (reply) `addcc 500` | `/addcc [user] amount` | Owner only (`SERVER_OWNER_IDS`): adds CC to yourself, or to the mentioned / replied-to member. No tax, nothing is taken from anyone |
| `العاب` | `/game list` | The games panel (see below) |
| `روليت` | `/game roulette` | Roulette (3–20 players, join with buttons) |
| `كراسي` | `/game chairs` | Chairs (3–25 players): grey chairs flash 🔴 at random (pressing then knocks you out), then turn 🟢 at a random moment and everyone races to sit |
| `مافيا` | `/game mafia` | Mafia with doctor and detective (5–20 players), 20 second phases |
| `اسئلة [جولات]` | `/game trivia` | General knowledge questions, anyone can answer |
| `خمن [جولات]` | `/game guess` | Guess the number 0–200 with ⬆️/⬇️ hints, 7 tries per player each round (🚫 when they run out) |
| `اسرع [جولات]` | `/game fast` | First to type the word |
| `فكك [جولات]` | `/game fakkek` | Split the word into letters |
| `رتب [جولات]` | `/game scramble` | Unscramble the letters |
| `حساب [جولات]` | `/game math` | Quick math |
| `وقف` / `وقف اللعبة` / `ايقاف` | `/game stop` | Stop the running game (its host or a trusted member) |
| `سؤال` | `/solo question` | One question, one try |
| `رقم` | `/solo number` | Guess 0–200 in 7 tries |
| `سلوت` | `/solo slots` | Slot machine, three of a kind wins |

Only one group game can run per channel. A game is controlled (start or cancel the lobby, stop
it) by its host and trusted members: the server owners, bot owners and the anti-nuke trusted
users/roles (`trusted`), the same people who can lift a hard ban.

**20 seconds, then AFK.** Every choice in a game has 20 seconds: the roulette turn, sitting in
chairs once they turn green, rock-paper-scissors, an XO move and each mafia phase. Whoever doesn't choose in time is
kicked for AFK: in roulette and chairs they are out, in XO the other player wins, and in mafia
they leave the game with their role shown and get no CC even if their team wins. Mafia starts
with everyone pressing 🎭 to see their own role privately; not pressing is AFK too. The answer
time of the chat games (trivia 10s, guess 60s, ...) is separate. A game that is cancelled (lobby cancelled or not
enough players) or stopped with `وقف` deletes all its messages and the command that started it;
the stop notice disappears after 5 seconds. Finished games keep their messages and results.

The CC commands (`cc`, `cctop`, `give`) are in the Games category with the games, so turning
off the Economy category in the command access dashboard doesn't hide them.

## The games panel

`العاب` (or `/game list`) posts a panel: an embed explaining every game, the rewards and the CC
commands, with a button for each game. Rows are colour coded like the embed sections:
🔵 lobby games, 🟢 chat games, ⚪ solo games, then `رصيدي` / `توب CC` / `وقف اللعبة`.
Game buttons start the game in the panel's channel; balance and top answer privately.
The buttons are handled globally (`src/interactions/buttons/games/gamesPanel.js`), so an old panel
keeps working after the bot restarts.

## Games channel (`1552714038817857556`)

The channel is for game commands only (`src/services/games/gamesChannel.js`). Anything else
posted there is deleted with a notice that disappears after 4 seconds (at most one notice per
member every 10 seconds). Still allowed:

- game and CC commands (`game`, `solo`, `rps`, `xo`, `cc`, `cctop` and their words) and
  the panel buttons;
- answers while a game runs there: anyone during chat games, only the players during roulette,
  chairs and mafia (mafia needs its day discussion), and the player of a solo `سؤال` / `رقم`;
- the server owners and this bot.

Other commands don't run there, and other slash commands get a private "games only" reply.

### Live Top CC board

The bot keeps one Top CC post in the games channel (`src/services/games/ccTopBoard.js`): the top 15
members, how many members have CC and the server total. It is posted at startup when missing and
then edited every 5 minutes; its footer says when it was last updated. The post's ID is saved in the
guild config (`boardMessageIds.cctop`), so a restart keeps editing the same post however far up the
channel it is, and deleting it makes the bot post a new one on the next refresh. `top cc` replies
look the same but have no footer, so they are never mistaken for the board.

## Level-up CC

Every level-up (from chat or voice XP) pays `10 × the new level` CC: level 1 = 10, level 10 = 100,
level 50 = 500. Gaining several levels at once pays each one. The level-up message in the levels
channel shows the CC. Staff setting levels by command pays nothing. The number is
`CC.levelUp.perLevel`.

## Invite rewards

Inviting people pays CC (`src/services/inviteRewardService.js`, numbers in `src/config/inviteRewards.js`).
When a member joins, the invite tracker finds the invite they used and saves who invited them. The
inviter gets **1,000 CC** once the invited member reaches **level 5** and has been in the server for
**3 days** (checked on every level-up and every 30 minutes). The CC event multiplier doesn't apply.

An invite doesn't count when the account is younger than 7 days (fake/alt accounts), when the member
was in the server before (a rejoin, or they already have a CC record), when someone invites
themselves, or when the invited member leaves before the reward. Each member can only ever be paid
for once.

Under the `welcome to chaos` message the bot posts a second, small message (Discord subtext) saying
who invited the member and the reward conditions, or why the invite doesn't count. When the reward
is paid, the welcome channel gets a notice that pings the inviter.

Paid invites give roles: `📨 5 Invites`, `💌 10 Invites`, `🏆 25 Invites`. They are created at
startup when missing (with no permissions, placed at the bottom, so move them where you like), and a
member only keeps the role of their highest tier.

`top invites` / `توب دعوات` / `دعواتي` (`/invitetop`) shows the top inviters, your own paid and
pending invites and the rules.

`انفايت` / `انفايت @member` (`/invite`) shows a member's invites: paid, pending, left and fake counts,
their rank, the CC they earned from invites, their invite role and how many more they need for the
next one, who invited them, and the members they invited (newest first) with each one's status.

## CC events (`CC.boost`)

`CC.boost` in `src/config/cc.js` multiplies every CC earned from games (group games, solo wins,
Clover wins and the games bot's API rewards) and level-up CC until the `until` time, then stops
by itself. The daily caps are flat amounts, not multiplied: solo wins are capped at **1,500 CC** a
day and Clover wins at **5,000 CC** a day while the event runs, and neither has a cap after it
(`CC.solo` and `CC.gamesBot`). While it runs, `رصيد` and `top cc` show `🔥 CC ×5` with when it ends, and Clover win
notices show the multiplier. Transfers and staff changes are never multiplied. To end it early, set
`multiplier: 1`.

Current event: ×5 until 2026-09-30 08:15 UTC.

## Sending CC (`give`)

`تحويل @member 100` (also `حول`, `transfer`, `cc give`, `/give`) sends CC to another member. The
sender pays the full amount and the receiver gets it minus the tax. The least you can send is 10 CC,
and you can't send to yourself or to a bot.

The tax depends on how many times the sender sent CC in the last 7 days: the first 3 pay 5%, then
every transfer pays 5% more (10%, 15%, 20%, ...) up to 50%. A transfer stops counting 7 days after
it was made. The tax is rounded up, so every transfer pays at least 1 CC. The reply shows the tax
and what the next transfer will cost. The numbers are `CC.transfer` in `src/config/cc.js`.

Received CC doesn't count as "earned" in the profile; it is kept apart in `ccStats.sent` /
`ccStats.received`.

## Storage

CC is stored in each member's economy record (`guild:<id>:economy:<user>`):
`cc`, `ccStats`, `ccSolo` (today's solo earnings), `ccGamesBot` (today's Clover earnings),
`ccTransfers` (when the member sent CC in the last 7 days, for the transfer tax) and
`ccInventory` (for the store) and `ccBourse` (bourse holdings, `{ assetId: { qty, cost } }`). An old `ccLastDaily` from the removed daily is left untouched.
The old `wallet` / `bank` values are left untouched and are no longer used, so everyone starts
from 0 CC. Every change goes through `src/services/cc/ccService.js`, which locks per member.

## The store

The items below are for our server only (`1155236281706627173`, `src/config/homeGuild.js`); other
servers keep the old sample store, always as a preview, and get no `رولي`, custom roles, trader role
or boosts (see `CLAUDE.md`).

The store is **open** in our server: buying takes the CC and gives the item. Setting
`ccStoreSettings.open = false` puts it back in trial mode (buying only checks the balance and shows a
receipt).

| # | Item | Price | What it gives |
|---|---|---|---|
| 1 | 🎁 صندوق حظ | 1,500 | Opened right away: 500–3,000 CC most of the time, 7,500 CC rarely (2%), or a chat XP ×2 hour (11%). About 1,235 CC back on average, so boxes don't create CC (`luckBoxPrizes`) |
| 2 | ⚡ بوست XP ×2 | 1,000 | Chat XP ×2 for an hour; buying more adds hours |
| 3 | 🎨 رول مميزة باسمك | 7,500 a month | A role for the buyer only |
| 4 | 👥 رول ليك ولصحابك | 25,000 a month | A role for the buyer (the leader) and up to 15 friends they invite |
| 5 | 🚀 لفل ×2 | 1,500 | Chat and voice XP ×2 for an hour |
| 6 | 💼 رول تاجر | 2,500 | The trader role |
| 7 | 🔮 تنبؤ البورصة | 6,500 | Shown to the buyer only: which way each bourse asset moves at the next hour, and roughly how much |

- **XP boosts** are saved at `guild:<id>:xpboosts` (`{ userId: { chat, voice } }`, when each ends)
  and read by `addXp` (`src/services/leveling/xpBoostService.js`). Two boosts never make ×4.
- **Forecast:** the bourse draws each hour's random move one hour in advance (`roll` in the market),
  so the forecast is what will happen with the demand so far; buying and selling before the hour
  ends can still push it a little.
- **Trader role (`💼 تاجر`):** the owner asked the bot to make it. On startup it is found (saved ID
  `traderRoleId` in the guild config, else by name) or, the first time only, created with no
  permissions just above the `🌌 Level 100` role (`src/services/cc/traderRoleService.js`). If the
  owner deletes it, it is not made again. Not made in a server without the Level 100 role.
- **Custom roles** (`src/services/cc/customRoleService.js`): confirming the purchase opens a form
  for the name, the colour (`#ff0000` or a name like `احمر`) and an icon (only on servers with role
  icons, boost level 2). Names that look like staff roles, links, mentions and names of other roles
  are refused. These are the only roles the bot creates besides the trader role: no permissions,
  just above the trader role, deleted when the subscription ends.
  - Every 30 days the price is taken from the leader's CC; a DM 3 days before. Not enough CC → 3
    more days (tried again every 30 minutes), then the role is deleted. `رولي الغي` stops the
    renewal (the role stays to the end of the paid month), `رولي كمل` restarts it.
  - Friends role: only the leader invites (`رولي انفايت @member`, accepted with a button within 24
    hours), removes (`رولي شيل @member`) or hands the role over (`رولي ليدر @member`, the renewal is
    then paid by the new leader); members can leave (`رولي اخرج`). 16 members at most, the leader
    included. One role of each kind per leader.
  - Saved at `guild:<id>:customroles`, keyed by role ID.

**The store room.** On startup the bot creates a text channel `🛒・المتجر` in category
`1547310323994853438` (or reuses it; its ID is saved as `storeChannelId` in the guild config, so it
can be renamed). The room copies the category's permissions, lets members type, blocks
attachments, links, reactions and threads, and has a 3 second slowmode.

- Only store commands can be written there; anything else is deleted with a notice that goes
  away after 4 seconds. Other slash commands get a private "store only" reply. The server
  owners and this bot are left alone.
- The store panel is pinned: a card with the items and their prices, a small grey card with the
  main commands (`متجر`, `متجر 1`, `مخزني`), and a menu to pick an item plus
  buttons (💰 رصيدي, 🎒 مخزني, 🏆 توب CC, ❓ المساعدة) that answer privately.
- Every **5** member messages under the panel, the old panel is deleted and it is sent and
  pinned again, so it is always near the bottom. Discord's "pinned a message" notice is deleted.

| Chat word | Slash | What it does |
|---|---|---|
| `متجر` / `shop` | `/store list` | The store panel: items, buy menu and buttons |
| `متجر 1` / `متجر رتبة vip` / `متجر 1 3` / `buy` | `/store buy item [quantity]` | Buy item 1 (by number or name, or 3 of it); a ✅ button confirms, only for the buyer |
| `مخزني` / `inventory` | `/store inventory` | What the member bought |
| `رولي` | `/myrole info` | The member's custom roles (members, leader, renewal) with a button for each thing they can do: 📨 invite (pick a member), ➖ remove and 👑 hand over (pick one of the role's members), 🛑 / ▶️ stop or restart the renewal, 🚪 leave; 🛍️ opens the store when they have none. Only the member who asked can press them; the message refreshes after each change |
| `رولي انفايت @x` / `رولي شيل @x` / `رولي ليدر @x` | `/myrole invite\|kick\|leader user` | The friends role leader invites, removes or hands over |
| `رولي اخرج` | `/myrole leave [role]` | Leave a friends role |
| `رولي الغي` / `رولي كمل` (`شخصي` / `صحاب`) | `/myrole cancel\|resume [kind]` | Stop or restart the renewal |
| `رصيد`, `توب cc` | `/cc`, `/cctop` | Also allowed in the store room |

Without the prefix `رولي` runs only alone or followed by one of its words (`انفايت`, `شيل`,
`اخرج`, `الغي`...), so chat like `رولي اتمسحت` is left alone. (`رول` stays the staff shortcut
for giving a role.)

- Catalog and settings: `src/config/store/ccStoreItems.js` (item format documented at the top;
  `repostEvery`, slowmode, category and channel name at the bottom).
- Buying: `buyItem()` in `src/services/cc/ccStoreService.js` checks the price, takes the CC and
  delivers the item (role, luck box prize, boost, forecast), refunding if delivery fails. Custom
  roles go through their form: `src/interactions/modals/store/customRole.js`.
- The room: `src/services/cc/storeChannel.js`; the panel and embeds: `src/services/cc/storeUi.js`;
  custom roles' form, invites and `رولي`: `src/services/cc/customRoleUi.js`,
  `src/interactions/buttons/store/customRole.js`, `src/commands/Games/myrole.js`.
- To open it for real: set `ccStoreSettings.open = true`.

## The bourse (البورصة)

Eight things members buy with CC and sell back later: their prices change at the start of every
hour (5:00, 6:00, 7:00...). The commands work in any channel (the store and games rooms included).

| Asset | Min | Max | Start | Move per hour |
|---|---|---|---|---|
| 🏍️ موتوسيكل | 200 | 600 | 400 | up to ±8% |
| 🥇 سبيكة دهب | 300 | 900 | 600 | up to ±3% |
| 🚗 عربية | 800 | 2,000 | 1,300 | up to ±5% |
| 🏠 شقة | 1,500 | 3,500 | 2,400 | up to ±3% |
| 🏪 محل تجاري | 2,500 | 5,500 | 4,000 | up to ±5% |
| 🏢 عقار (عمارة) | 4,000 | 9,000 | 6,000 | up to ±3% |
| 🚢 سفينة | 6,000 | 13,000 | 9,000 | up to ±8% |
| ✈️ طيارة | 8,000 | 18,000 | 12,000 | up to ±10% |

- Each hour an asset moves by a random amount up to its volatility and never leaves its range.
  Near a limit the move leans back towards the middle. Prices always look random (1,325, not
  2,000): the first price is random around `start`, and a price past a limit ends a random step
  inside it instead of on the limit.
- **Demand:** every member who bought an asset during the hour (more than they sold) adds +1% to
  its next move and every net seller −1% (together at most ±15%). Buying also lifts the asset's
  ceiling above its max by the same percent (up to +50%); each hour without buying demand lowers it
  by 5% again, so the price comes back to its normal range by itself. Counting members, not pieces,
  means one member can't pump a price on their own: +1% is less than the 1.5% sell fee.
- Selling pays the price of the hour minus a **1.5%** fee (rounded up, at least 1 CC).
- At most **10** pieces of each asset per member.
- Buying and selling are confirmed with a ✅ button that only works for that member. If a new hour
  started in between, nothing happens and the confirmation is shown again at the new price.

| Chat word | Slash | What it does |
|---|---|---|
| `اسعار` / `بورصة` | `/bourse prices` | A card per asset with its price and move since last hour (🟢 ▲ / 🔴 ▼, nothing when it didn't move; 🔥 when in demand); the rules in the footer |
| `شراء عربية` / `استثمار عربية` / `شراء 3 2` | `/bourse invest asset [quantity]` | Buy by name or number (2 of it) |
| `بيع عربية` / `بيع 3 2` | `/bourse sell asset [quantity]` | Sell at the price of the hour |
| `ممتلكاتي` | `/bourse holdings` | What the member owns, what they paid and what they'd get selling now |

Without the prefix `استثمار` / `بيع` run only when what follows is a number or exactly an asset's
name, optionally with a number (`بيع سبيكة دهب 2`, `استثمار العربية`), so a sentence like `بيع
العربية دي` is left alone. Receipts show the balance before and after, read in the same save.

- Assets and rules: `src/config/store/bourse.js`. Changing a price range takes effect at the next
  read; never change an asset's `id` (it is the key in members' holdings).
- The market of a guild is saved at `guild:<id>:bourse` (`hour`, and per asset `price`,
  `previous`, `raise`, `roll` (the next hour's random draw, for the store's forecast), `flow`). There is no timer: whenever the market is read in a later hour,
  the missed hours are played in order (at most 168), so a restart changes nothing.
- Logic: `src/services/cc/bourseService.js`; embeds: `src/services/cc/bourseUi.js`; command:
  `src/commands/Games/bourse.js`; confirm buttons: `src/interactions/buttons/store/bourse.js`.

## Clover wins

The games bot is [Clover](https://clovers.gg). When a Clover game ends it posts `👑 | @winner`;
this bot reads that message (`src/services/cc/gamesBotWins.js`) and pays the winner
**10 CC**, at most **200 CC a day** (UTC) from Clover wins (`CC.gamesBot` in `src/config/cc.js`).
Every win also counts as a game, a top 3 and a 1st place in the member's stats, even after the cap.
A short reply under Clover's message shows the CC and new balance and is deleted after 15 seconds.

Only messages from the Clover bot count (`1006332825571692544`), so typing the same text does
nothing, and each message pays once. With Clover Premium (a server copy of the bot with its own
ID) put that ID in `GAMES_BOT_IDS`.

## CC API for the games bot

The games bot reads and pays CC over HTTP on this bot's web server (same `PORT` as `/health`).
Code: `src/services/cc/ccApi.js`.

**Setup**

1. Pick a long random secret (16+ characters) and set it as `CC_API_TOKEN` on this bot.
2. Give the games bot the same secret and this bot's address, e.g. `http://<host>:<PORT>/api/cc`.
3. Every request sends `Authorization: Bearer <CC_API_TOKEN>`. Without the variable the API
   answers `503` and changes nothing; a wrong token gets `401`.

Only guilds this bot is in are accepted (`404` otherwise). User IDs are strings.

| Method and path | Body | What it does |
|---|---|---|
| `GET /api/cc/:guildId/users/:userId` | – | `{ userId, cc, stats }` |
| `GET /api/cc/:guildId/top?limit=10` | – | `{ members, total, top: [{ userId, cc, earned }] }` (1–100 rows) |
| `POST /api/cc/:guildId/group-game` | `{ game, players: [ids], ranking: [ids] }` | Pays a finished group game with the rules above (pool `10 × players`, 50/30/20 for the top 3); `ranking` is the finishing order, 1st first. Returns `{ paid: [{ userId, place, amount, balance }] }` |
| `POST /api/cc/:guildId/solo-win` | `{ userId, game }` | A solo win: 5 CC (×event), at most 1,500 CC a day during a CC event, no cap after. Returns `{ amount, capped, balance }` |
| `POST /api/cc/:guildId/add` | `{ userId, amount, reason }` | Custom reward, 1–10,000 CC. Returns `{ ok, amount, balance }` |
| `POST /api/cc/:guildId/spend` | `{ userId, amount, reason }` | Takes CC (entry fee, bet). Returns `{ ok: false, balance }` when the member can't afford it |

Any POST can carry a `requestId` (letters, numbers, `_.:-`): repeating it within 10 minutes
returns the first answer without paying again, so the games bot can safely retry after a timeout.

Example (Node.js, from the games bot):

```js
await fetch(`${CC_API_URL}/${guildId}/group-game`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CC_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ game: 'roulette', players, ranking: [winnerId, secondId, thirdId], requestId: gameId }),
});
```

Every payment is logged (`[CC] ...`) and shows up in the member's `رصيد` and the Top CC board.

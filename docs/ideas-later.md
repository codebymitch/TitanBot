# Ideas saved for later

Ideas the owner wants, parked on purpose. Not built yet; pick them up when asked.
They are also listed in the trusted channel from `src/config/savedIdeas.js`: keep that file in sync when an idea is added or built.

## Suggestions channel

- A set channel where every message becomes a suggestion: the bot reposts it as an embed (or keeps
  it) and adds 👍 👎.
- Staff buttons: accept / reject (with an optional reason); the embed changes colour and says who
  decided. The author could get a DM.
- Optional: a thread per suggestion for discussion, and `top suggestions` by votes.

## Staff task system

- A dedicated channel where the bot hands out tasks to staff: reports to solve, or something to add
  or do. Each task has a deadline.
- Who gets what comes from the staff roles: the bot looks at a role (e.g. Admin), lists its members
  and picks one. Easy tasks go to the members who solve the least; hard tasks go to the role above,
  and so on up the hierarchy.
- At first the picks are random. Over time the bot tracks who finished their tasks on time and who
  didn't; a task that runs past its deadline is taken back and given to someone else.
- Never assigned: the `psycho` role and the owners (`src/config/serverOwners.js`).
- Skips: each staff member can skip (hand back) at most 3 tasks per week. The 4th skip in the same
  week sends the owner (`1159601661392715906`) a message with a mention saying that member went over
  the allowed skips.
- The owner's example of the task board, one row per task (problem, solution, who is responsible,
  deadline). The responsible can be a team or role, and the deadline a weekday or a duration:

  | المشكلة        | الحل            | المسؤول     | الموعد |
  | -------------- | --------------- | ----------- | ------ |
  | قلة النشاط     | Events أسبوعية  | Events Team | الجمعة |
  | Spam           | تحسين AutoMod   | Bot Team    | 3 أيام |
  | Staff inactive | Activity system | Admins      | أسبوع  |

- The GUI: same information as that table, but simpler and easier to read. Discord doesn't draw
  tables, so each task is its own small card (an embed field) with emojis, e.g.:

  ```
  📉 قلة النشاط
  ✅ Events أسبوعية
  👥 Events Team ・ ⏰ الجمعة

  🚫 Spam
  ✅ تحسين AutoMod
  👥 Bot Team ・ ⏰ خلال 3 أيام
  ```

  The deadline shows as a Discord timestamp (`<t:…:R>`, "in 3 days") and the card colour or a dot
  (🟢 on time, 🟡 due soon, 🔴 late) shows the state at a glance.

- Possible pieces: tasks stored per guild (assignee, difficulty, deadline, status), buttons on each
  task (done / can't do it), a per-member score (done on time, late, handed back), and a summary
  board in the channel. Reports from the report channel (`src/services/reportChannelService.js`)
  could become tasks automatically.

## Fully automatic moderation (no staff)

The owner's long-term goal: everything the staff does today is done by the bot on its own, so the
server no longer needs a staff team.

- Already automatic: the insult filter, anti-spam, owner-mention guard, media and invite-link guards,
  anti-nuke / anti-raid, hard bans, warn escalation and the reports saved as issues.
- Still done by people, to move to the bot one by one: reading reports and acting on them, tickets,
  verification, giving and removing roles, unbans and appeals, and deciding punishments that need
  judgement (the staff task system above is the step in between).
- The owner keeps the last word: the bot logs every action, and big decisions (bans, role changes,
  anything it isn't sure about) go to the owner to confirm instead of a staff member.


## Free LLM APIs list (reference link)

The owner saved this link: https://github.com/mnfst/awesome-free-llm-apis

- A curated list of LLM APIs with a free tier for text inference, each with a link to get an API key.
- Two sections: provider APIs (companies with their own models, e.g. Google Gemini, Mistral AI) and
  inference providers (platforms hosting open-weight models, e.g. Groq, OpenRouter).
- Each entry gives the base URL, models, context and output limits, modalities and rate limits.
- Not built yet: no feature decided. Pick it up when asked (e.g. an AI chat command or smart replies
  on a free tier).

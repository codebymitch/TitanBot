# Project memory

## Product intent & audience

- Discord milestone/leveling bot for tracking member hours (5h–1000h ladder).
- Announces level-ups with a graphical card image.
- Target users: community/guild members accumulating hours; admins configuring tiers.

## Brand personality & voice

- Indonesian-language interaction (user communicates in Bahasa Indonesia).
- Concise, task-focused updates; confirm checks with evidence (test ranges, counts).

## Visual design & UX direction

- Milestone cards: image-based announcements preserved across all tier levels.
- Level labels kept "clean" — no duplicate hour suffixes (e.g., avoid "5 Jam 5 Jam").
- Tier naming supports custom/repeated role names; cleanup rules must handle duplicates globally, not per-level.

## Decisions, constraints & rationale

- Hour-suffix dedup rule generalized to all milestone levels (was Lounge Regular-specific).
- 10 standard levels tested: 5, 10, 25, 50, 100, 250, 500, 750, 1000 — no double formatting found after fix.
- Shell test scripts must avoid bare `${...}` interpolation; use safe wrappers.
- Bot startup config issues are tracked separately from milestone logic.

## Open questions & assumptions

- Assumption: "level" == milestone tier tied to accumulated hours.
- Unverified: whether non-standard/custom milestone thresholds beyond the 10 tested need the same dedup guard.
- Unverified: persistence of the fix across config reloads/bot restarts.
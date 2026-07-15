---
name: Self-hosted Docker deploy pitfalls
description: Windows batch launcher and Drizzle/Telegram-bot gotchas when a Replit app is also run self-hosted via Docker Compose on a user's own machine.
---

## Windows .bat launcher scripts
- Files authored/edited in this Linux sandbox default to LF line endings. Multi-line parenthesized `if (...)` / `for (...)` blocks in cmd.exe require true CRLF or they fail to parse, causing the window to flash and close instantly with no visible error.
- Prefer flat `if ... goto label` / `:label` structure over multi-line parenthesized blocks entirely — it's far more robust with Cyrillic text and embedded PowerShell one-liners, and avoids cmd's fragile paren-counting (which counts every unescaped "(" / ")" in a block, even inside quoted strings).
- `::` used as a "comment" inside a parenthesized block breaks cmd.exe with ": was unexpected at this time." — `::` is actually a label token; only safe as a comment at the top level. Use `rem` inside any block.
- Always verify fixes by asking the user to run the script from an already-open terminal (not double-click) — double-clicked .bat/.exe windows auto-close on completion/error, hiding the real error message.
- **Why:** spent many iterations blind-fixing a Limited.Ink self-hosted launcher; the actual error only became visible once the user ran it from PowerShell directly.

## Drizzle-kit push interactive prompts in automated Docker init scripts
- If any DB table exists that Drizzle's schema doesn't know about (e.g. a session table created by raw SQL / connect-pg-simple's `ensureSessionTable()`, not part of the Drizzle schema), `drizzle-kit push` will interactively ask "is this a rename?" for **every single new table** in the schema, since it can't tell schema-only tables from renames of that orphan table. This blocks fully automated first-time DB setup (`docker compose exec -T ...` swallows the prompt and hangs/fails silently if stderr is redirected away).
- **Fix:** drop the non-Drizzle-managed table (e.g. `DROP TABLE IF EXISTS user_sessions;`) before running `drizzle-kit push` on a fresh DB — it gets recreated automatically by the app's own bootstrap (`CREATE TABLE IF NOT EXISTS`), no data loss.
- Never silently swallow errors/exit codes (`2> nul`, `|| true`) around a first-time migration step in a setup script — if it fails, the app looks like it works but every DB-backed feature 500s until someone happens to run the migration manually.

## Telegram bot: don't run the same bot token in two places
- If a Telegram bot (long-polling) is enabled both on the Replit dev workflow AND in a user's self-hosted Docker deployment with the *same* `TELEGRAM_BOT_TOKEN`, both instances race to receive each Telegram update. Whichever wins writes to its own database — so license codes generated via the bot may land in the wrong database, causing "invalid code" errors that look like an unrelated auth bug.
- **How to apply:** when helping a user move a Repl-hosted bot to fully self-hosted/local operation, gate the Replit-side bot off (e.g. `!process.env.REPL_ID`) so only one instance ever polls a given bot token at a time.

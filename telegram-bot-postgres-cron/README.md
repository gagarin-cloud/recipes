# Telegram bot with Postgres and a daily digest

A Telegram bot that saves every message it sees to Postgres and answers with a
count. Once a day, a scheduled job sends each chat a summary of who said how
much. Page: https://gagarin.cloud/recipes/telegram-bot-postgres-cron

## What you build

```
telegram (external) ──┐
                      ├──> bot (service, :8080, private)
db (postgres) ────────┤
                      └──> digest (job, 07:00 UTC daily)
```

The bot long-polls Telegram, so it needs no public address. The digest is the
same image started with `MODE=digest`.

## Paste this into your coding agent

```
Deploy the telegram-bot-postgres-cron recipe from https://github.com/gagarin-cloud/recipes to Gagarin Cloud. Follow https://gagarin.cloud/recipes/telegram-bot-postgres-cron
```

You need a bot token from [@BotFather](https://t.me/BotFather). The agent asks
you for it and keeps it out of the repository.

## What Gagarin creates

| Name | Kind | Size | Holds |
|---|---|---|---|
| `db` | postgres | s, 1 GB disk | the messages |
| `telegram` | external | none | `TELEGRAM_TOKEN` |
| `bot` | service | s | the bot, private |
| `digest` | scheduled job | s | `0 7 * * *` UTC |

## The commands

Run from this directory, with Docker running.

```
gg init tgbot
gg resource add tgbot/db postgres --storage 1
gg resource add tgbot/telegram external --env-file .env.telegram
gg build tgbot/bot:v1 --push
gg deploy tgbot/bot:8080 bot:v1 --deps db --deps telegram
gg run tgbot/digest bot:v1 --schedule "0 7 * * *" --env MODE=digest --deps db --deps telegram
gg status tgbot
```

`.env.telegram` holds one line, `TOKEN=<your token>`, and Gagarin publishes it
as `TELEGRAM_TOKEN`. Add it to `.gitignore` before you write it.

## What it costs

About $20.59 a month: two size-s containers at $10.22 each and 1 GB of disk
at $0.15. The digest runs for a few seconds a day, under a cent a month.
Traffic is free. Rates: https://gagarin.cloud/pricing

## What can go wrong

- `gg build` fails before it starts: Docker is not running. `docker info` says.
- The bot logs `polling: Unauthorized`: the token is wrong. Restate the
  external with the right one: `gg resource rotate tgbot/telegram --env-file .env.telegram`.
- The digest never arrives: `gg status tgbot` shows each firing and how it
  ended, and `gg logs tgbot/digest` shows what it printed.
- Times are UTC. Add `--tz Europe/Berlin` (or your zone) to the `gg run` line.

## Run it locally

```
cp .env.example .env    # put the token in it
docker compose up --build
docker compose run --rm digest
```

## Clean up

```
gg destroy tgbot
```

Gagarin emails the project owner a button to approve the deletion.

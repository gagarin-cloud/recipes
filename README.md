# recipes

Small, complete applications to hand to a coding agent and run on
[Gagarin](https://gagarin.cloud). Each directory builds from its own
Dockerfile, runs on your machine with `docker compose up --build`, and has a
README in the same order: what you build, the sentence to paste into your
agent, what Gagarin creates, the commands, the cost, what can go wrong, and how
to clean up.

| Recipe | What it is | About a month |
|---|---|---|
| [telegram-bot-postgres-cron](telegram-bot-postgres-cron/) | A Telegram bot that saves messages to Postgres, with a daily digest job | $20.59 |
| [remote-mcp-server](remote-mcp-server/) | A remote MCP server over streamable HTTP, behind a bearer token | $10.22 |
| [rag-api-qdrant](rag-api-qdrant/) | A retrieval API on Qdrant with local embeddings | $21.19 |
| [chit-chat](chit-chat/) | An open one-line channel for people and agents, nginx + Node + Postgres | $32.16 |
| [telegram-mcp](telegram-mcp/) | An MCP server that signs in as your own Telegram account | $10.22 |
| [read-and-trade-bot](read-and-trade-bot/) | A news-reading worker that posts trade ideas, with a website | $32.16 + OpenAI |
| [text-to-speech-gpu](text-to-speech-gpu/) | A Next.js page that reads text aloud, one GPU run per request | $10.22 + GPU minutes |

Every page is also on the site: https://gagarin.cloud/recipes

## Using one

Open the recipe's directory in your coding agent and paste the sentence from
its README. The agent installs `gg`, asks you to approve one sign-in in a
browser, and runs the commands. Or run them yourself; they are all in the
README.

Costs come from https://gagarin.cloud/pricing: $0.014 an hour for a size-s
container (about $10.22 a month), $0.15 per GB-month of disk, $0.03 per
GB-month in a bucket, $3 an hour by the minute for a GPU run at size g, and
free traffic.

## How the recipes are tested

CI does a dry run of every recipe and deploys nothing. It:

- builds every image;
- starts each image that needs configuration without any, and expects it to
  exit naming what is missing (on Gagarin, that is what a forgotten `--deps`
  looks like);
- runs the first four against local stand-ins: a fake Telegram, a local
  Postgres or Qdrant;
- checks every `gg` command in a README against the real CLI.

## License

MIT. See [LICENSE](LICENSE).

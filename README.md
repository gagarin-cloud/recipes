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

Every page is also on the site: https://gagarin.cloud/recipes

## Using one

The quickest way is the "Deploy to Gagarin Cloud" badge at the top of each
recipe's README. It opens the recipe in the console, asks for its inputs (your
own keys, never ours), and installs it into a new project of yours.

Or open the recipe's directory in your coding agent and paste the sentence from
its README. The agent installs `gg`, asks you to approve one sign-in in a
browser, and runs the commands. Or run them yourself; they are all in the
README.

Costs come from https://gagarin.cloud/pricing: $0.014 an hour for a size-s
container (about $10.22 a month), $0.15 per GB-month of disk, and free traffic.

## How the recipes are tested

CI does a dry run of every recipe and deploys nothing. It:

- builds every image;
- starts each image that needs configuration without any, and expects it to
  exit naming what is missing (on Gagarin, that is what a forgotten `--deps`
  looks like);
- runs the first four against local stand-ins: a fake Telegram, a local
  Postgres or Qdrant;
- checks every `gg` command in a README against the real CLI;
- lints the example deploy workflows (chit-chat has one, in
  `chit-chat/.github/workflows/`) and this repository's own publish workflow,
  and checks that each takes its credential from
  the repository's secrets, names it and every other secret nowhere else, never
  runs `gg login`, and tags every image it builds or deploys with the commit. The checks run here, but the workflows
  themselves only run once somebody copies the recipe into a repository of
  their own.

## How a recipe is published

Every recipe here is published as a one-click recipe. Each runs in a project of
its own in the gagarin account, built from this repository with placeholder
values in its externals, since a recipe carries an external's variable names
and never its values.

The `publish` workflow (`.github/workflows/publish.yml`) keeps them current. On
a push to `main`, `.ci/changed-recipes.sh` lists the recipes whose images the
push changed: anything in the directory but Markdown and its example workflow.
For each, the workflow builds the images tagged with the commit, deploys them
into that recipe's project, and snaps a new version with `gg recipe snap`. Its
notes, which the deploy page shows, come from the recipe's `recipe-notes.txt`.
Run it by hand and it republishes all of them.

## License

MIT. See [LICENSE](LICENSE).

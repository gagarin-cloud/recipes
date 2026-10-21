# Remote MCP server

A remote MCP server over streamable HTTP with one example tool, behind a bearer
token, at an HTTPS address your agent can connect to. Page:
https://gagarin.cloud/recipes/remote-mcp-server

## What you build

What Gagarin creates, and what may reach what. An arrow is a dependency edge: the left side can reach the right and is handed its credentials. The recipe's page draws this as a graph.

- `mcp` (service, :8080 · /mcp, public address) → `auth`
- `auth` (external, AUTH_TOKEN)

The server is stateless: each request gets a fresh MCP server, so a restart
loses nothing. The example tool, `time_in`, returns the time in a zone. Replace
it with yours in `src/server.js`.

Auth is a bearer token. That suits a server you and your own agents use.
Claude's connector directory and other public clients expect OAuth; that is a
separate recipe, not this one.

## Paste this into your coding agent

```
Deploy the remote-mcp-server recipe from https://github.com/gagarin-cloud/recipes to Gagarin Cloud, then connect it to me. Follow https://gagarin.cloud/recipes/remote-mcp-server
```

## What Gagarin creates

| Name | Kind | Size | Holds |
|---|---|---|---|
| `auth` | external | none | `AUTH_TOKEN` |
| `mcp` | service | s | the server, at a public HTTPS address |

## The commands

Run from this directory, with Docker running.

```
gg init mcpdemo
gg resource add mcpdemo/auth external --env-file .env.auth
gg ship mcpdemo/mcp:8080 --deps auth
gg domain add mcpdemo/mcp
```

Make `.env.auth` with `echo "TOKEN=$(openssl rand -hex 32)" > .env.auth` and
add it to `.gitignore`. Gagarin publishes it as `AUTH_TOKEN`; the server
refuses to start with a token shorter than 32 characters.

Then connect, with the address `gg domain add` printed:

```
claude mcp add --transport http mine https://<address>/mcp --header "Authorization: Bearer <token>"
```

## What it costs

About $10.22 a month: one size-s container. The external, the address and the
traffic are free. Rates: https://gagarin.cloud/pricing

## What can go wrong

- `gg ship` fails before it builds: Docker is not running. `docker info` says.
- Every call answers 401: the header is missing or the token differs from the
  one in `.env.auth`. The header is `Authorization: Bearer <token>`, one space.
- `gg logs mcpdemo/mcp` says `AUTH_TOKEN is not set`: the deploy left out
  `--deps auth`. Run `gg deps add mcpdemo/mcp auth`.
- A new token: `gg resource rotate mcpdemo/auth --env-file .env.auth`. The
  service restarts holding it, and every client needs the new one.

## Run it locally

```
cp .env.example .env    # put a 32+ character token in it
docker compose up --build
```

## Clean up

```
gg destroy mcpdemo
```

Gagarin emails the project owner a button to approve the deletion.

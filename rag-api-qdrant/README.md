# Retrieval API with Qdrant

An HTTP API that stores passages of text in Qdrant and returns the ones closest
to a question. It is the retrieval half of RAG: pass what `/ask` returns to
your model of choice for the answer. Page:
https://gagarin.cloud/recipes/rag-api-qdrant

## What you build

What Gagarin creates, and what may reach what. An arrow is a dependency edge: the left side can reach the right and is handed its credentials. The recipe's page draws this as a graph.

- `api` (service, :8080 · size s, public address) → `vectors`, `auth`
- `vectors` (Qdrant, 5 GB disk)
- `auth` (external, AUTH_TOKEN)

- `POST /ingest` with `{"texts": [...]}` embeds and stores up to 256 passages.
- `POST /ask` with `{"question": "...", "limit": 3}` returns the closest ones.
- Both need `Authorization: Bearer <token>`. `GET /healthz` does not.

Embeddings come from `BAAI/bge-small-en-v1.5`, run inside the container with
fastembed. There is no embeddings API to pay for, and the model is part of
the image, so the first request does not wait for a download.

## Paste this into your coding agent

```
Deploy the rag-api-qdrant recipe from https://github.com/gagarin-cloud/recipes to Gagarin Cloud. Follow https://gagarin.cloud/recipes/rag-api-qdrant
```

## What Gagarin creates

| Name | Kind | Size | Holds |
|---|---|---|---|
| `vectors` | qdrant | s, 5 GB disk | the passages and their vectors |
| `auth` | external | none | `AUTH_TOKEN` |
| `api` | service | s | the API, at a public HTTPS address |

## The commands

Run from this directory, with Docker running.

```
gg init search
gg resource add search/vectors qdrant --storage 5
gg resource add search/auth external --env-file .env.auth
gg ship search/api:8080 --deps vectors --deps auth
gg domain add search/api
```

Make `.env.auth` with `echo "TOKEN=$(openssl rand -hex 32)" > .env.auth` and
add it to `.gitignore`. Gagarin publishes it as `AUTH_TOKEN`, and the qdrant
gives the service `VECTORS_URL` and `VECTORS_API_KEY`.

Try it with the address `gg domain add` printed:

```
curl -H "Authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"texts":["Paris is the capital of France."]}' https://<address>/ingest
curl -H "Authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"question":"What is the French capital?"}' https://<address>/ask
```

## What it costs

About $21.19 a month: two size-s containers at $10.22 each and 5 GB of disk at
$0.75. A qdrant serving real traffic wants size m, which makes it about $41.63.
Traffic is free. Rates: https://gagarin.cloud/pricing

## What can go wrong

- `gg ship` fails before it builds: Docker is not running. `docker info` says.
- The image is about 800 MB, most of it the model and its runtime. The first
  push takes a minute or two on a slow uplink.
- `/ask` returns nothing: nothing was ingested yet, or it went to another
  project's qdrant. `gg status search` lists what the project holds.
- The qdrant keeps a nightly backup for 14 days: `gg resource backups search/vectors`.

## Run it locally

```
cp .env.example .env    # put a token in it
docker compose up --build
```

## Clean up

```
gg destroy search
```

Gagarin emails the project owner a button to approve the deletion. The
vectors go with it.

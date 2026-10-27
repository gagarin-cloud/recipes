# Text to speech on a GPU: type it, hear it

A web page where you paste up to 5,000 characters, pick a voice and press
Speak. Each press starts its own GPU run on Gagarin, which reads the text in an
open-weights voice and writes a WAV to a bucket; the page plays it when it
lands. There is no API service: the page's own route handlers start the runs
with the Gagarin SDK. Page: https://gagarin.cloud/recipes/text-to-speech-gpu

## What you build

What Gagarin creates, and what may reach what. An arrow is a dependency edge: the left side can reach the right and is handed its credentials. The recipe's page draws this as a graph.

- `web` (service, Next.js, :3000, public address) → `files`, `gagarin`
- `tts-*` (job, size g, one per request, started by `web`) → `files`
- `files` (s3 bucket, private)
- `gagarin` (external: the token `web` starts runs with)

The web writes each request to the bucket, then starts a run of the `tts` image
under a job name of its own, `tts-<id>`. The run reads the text from the
bucket, speaks it on an NVIDIA L4, writes `<id>.wav` back and exits. The bucket
stays private; the web streams the audio out of it.

## Paste this into your coding agent

```
Deploy the text-to-speech-gpu recipe from https://github.com/gagarin-cloud/recipes to Gagarin Cloud. Follow https://gagarin.cloud/recipes/text-to-speech-gpu
```

Nothing to sign up for: the speech model is open and baked into the image.

## What Gagarin creates

| Name | Kind | Size | Holds |
|---|---|---|---|
| `files` | s3 | — | each request's text, its audio, and why it failed if it did |
| `web` | service | s | the page and its four routes, at a public HTTPS address |
| `tts-*` | job | g | one run per request: one L4 GPU, 6 vCPU, 40 GB |
| `gagarin` | external | — | the credential `web` starts runs with, as `GAGARIN_TOKEN` |

## The commands

`./deploy.sh` runs these for you. Run from this directory, with Docker running.

```
gg init speak
gg resource add speak/files s3
printf 'TOKEN=%s\n' "$(gg creds create --name "speak/web: starts GPU runs" 2>/dev/null)" > .env.gagarin
gg resource add speak/gagarin external --env-file .env.gagarin
rm .env.gagarin
gg build speak/tts:v1 --context ./tts --push
cp .env.example .env
gg ship speak/web:3000 --context ./web --size s --env-file .env
gg deps add speak/web files gagarin
gg domain add speak/web
```

The token goes into an external resource called `gagarin` with the key `TOKEN`,
so `web` holds exactly the `GAGARIN_TOKEN` the SDK reads, and it never sits in a
deploy's environment. It never reaches the terminal either. `.env` holds only
`GAGARIN_PROJECT`, `TTS_IMAGE` and `RUNS_PER_HOUR`.

Nothing runs the job by command: the web starts one run per request. To speak a
request the web has already saved (its id is on its card), by hand:

```
gg run speak/tts tts:v1 --size g --deps files --env TEXT_KEY=<id> --env VOICE=af_heart
```

## What it costs

About $10.22 a month for `web`, plus GPU minutes:

- **GPU runs: $3 an hour, by the minute**, from when the run's container
  starts. A request is usually one minute, **$0.05**: most of it is Python and
  the model loading onto the GPU, and the speech itself takes seconds. The
  longest text the page takes, about 1,000 words and seven minutes of audio, is
  still about a minute on the GPU. The page shows its estimate before you
  press Speak.
- **The wait is free.** The first run of a burst waits three to six minutes for
  a GPU machine to boot; that wait and the image pull are not billed. A run
  within ten minutes of the last one finds the machine up and starts at once.
- **The bucket: $0.03 per GB-month.** A minute of audio is 2.9 MB, so a
  gigabyte holds about six hours of it.
- A run is stopped at 20 minutes, so the most a single request can cost is
  $1.00. `RUNS_PER_HOUR` (30 unless you say) caps how many the page starts.

Rates: https://gagarin.cloud/pricing

## What can go wrong

- **The card says "Waiting for a GPU machine" for several minutes.** That is
  the machine booting: three to six minutes the first time, nothing billed,
  not stuck. Do not press Speak again for the same text; every press is a new
  run. Past six minutes the one GPU is usually busy with another run, and this
  one starts when it is free.
- **The first run on a fresh machine is slow to start.** The image carries
  CUDA, PyTorch and the model, about 4 GB to pull and 8 GB unpacked. Pulling is
  not billed, but it counts against the run's 20-minute timeout.
- **Speak answers that this Gagarin does not offer size g** (`invalid_size`):
  the platform has no GPU size yet. Nothing was started.
- **Speak answers that the token cannot start runs**: it expired (90 days),
  was revoked, or lacks deploy scope. Mint a new one into `.env.gagarin` as
  above and `gg resource rotate speak/gagarin --env-file .env.gagarin`.
- **`web` restarts once on the first deploy.** It exits at boot naming
  `FILES_ENDPOINT` until `gg deps add speak/web files gagarin` lands.
- **The address is public, and every press of Speak is a GPU run.**
  `RUNS_PER_HOUR` in `.env` is the ceiling: at a minute each, 30 runs an hour
  is $1.50 an hour. Leave out `gg domain add` to keep it to yourself.
- **A forgotten variable.** A deploy replaces the whole environment; ship with
  `./deploy.sh`, which restates all of it.
- `gg ship` fails before it builds: Docker is not running. `docker info` says.

## Run it locally

```
docker compose up --build
```

Then open http://localhost:3000. Speak needs a real Gagarin token to start a
run, because the runs happen on Gagarin's GPUs, so locally nothing starts one:
Speak saves the request to a local bucket and its card shows the command that
speaks it on your machine, on the CPU, in well under a minute:

```
docker compose run --rm -e TEXT_KEY=<id> -e VOICE=af_heart tts
```

The page plays the audio as soon as it lands. The bucket is
[S3Mock](https://github.com/adobe/S3Mock) on :9090, which creates the bucket on
start; its objects go with `docker compose down`. The first `tts` build pulls
about 4 GB. `./smoke/test.sh` runs all of this end to end.

## Clean up

```
gg destroy speak
```

Gagarin emails the project owner a button to approve the deletion, and the
bucket's objects are deleted for good shortly after. The token outlives the
project until it expires: `gg creds` lists it as "speak/web: starts GPU runs",
and `gg creds revoke ID` ends it now.

---

## How it works, in detail

```
browser            web (Next.js, size s)                 Gagarin               tts-<id> (job, size g)
  │  POST /api/speak  │                                      │                        │
  ├──────────────────►│ put <id>.json in files               │                        │
  │                   │ gg.jobs.run("speak", "tts-<id>",     │                        │
  │                   │   { image, size: "g", deps: [files], │                        │
  │                   │     env: { TEXT_KEY, VOICE } })  ───►│ waits for a GPU machine│
  │  202 { id }       │                                      │ (3–6 min, unbilled)    │
  │◄──────────────────┤                                      ├───────────────────────►│ get <id>.json
  │  GET /api/speak   │                                      │                        │ speak at 24 kHz
  │  every 5 s ──────►│ list files; projects.status ────────►│                        │ put <id>.wav
  │                   │                                      │                        │ exit 0
  │  <audio src=/api/audio/<id>>  stream <id>.wav from files │                        │
```

**One job name per request.** Starting a run on a job stops that job's run
still going, so two people pressing Speak at once would cancel each other under
one name. Each request is `tts-<id>`, where the id is the time in base 36 and
four random characters: nothing a user typed, and it sorts by age. A finished
one-shot job removes itself after its TTL, so the names do not pile up.

**The bucket is the record.** A job has no volume and keeps nothing between
runs, and the platform forgets a finished run after its TTL. So the request
(`<id>.json`: text, voice, time, job name, revision), the audio (`<id>.wav`)
and any failure (`<id>.error`, with the run's last log lines) all live in
`files`, and the list on the page is read from there. The platform is asked
only about requests with neither audio nor an error yet, all of them in one
`projects.status` call: waiting for a machine is *pending*, a running run is
*running*, audio is *done*, and a failed run is *failed*, with the reason
copied into the bucket the first time the page sees it.

**The text travels through the bucket, not the environment.** A run's
environment is stored with its revision; five thousand characters of
somebody's text do not belong there. The run gets an id and a voice name.

**The model** is [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M),
Apache-2.0: 82 million parameters, natural English in American and British
voices, and fast enough on an L4 that the speech is a few seconds of a
one-minute run. Its English front end falls back to espeak-ng for unknown
words, which arrives as a Python wheel. The weights and the six voices are
downloaded at build time from a pinned revision, and the image runs with the
Hugging Face hub offline: a run downloads nothing. The base is the official
PyTorch image with CUDA 12.6, which runs on any driver from the 560 series up.
The script prints the device it used, `cuda` on Gagarin; without a GPU (under
`docker compose`) it falls back to the CPU, which would be a silent waste at
GPU prices, hence the line.

**The SDK.** The web depends on the published `@gagarin-cloud/sdk` 0.1.1. Its
`Size` type does not list `"g"` yet, so `lib/gagarin.ts` casts it; the API takes
it on a run, and the type catches up in the next release. 0.1.1 does not send a
run's TTL either, so the jobs keep the platform's default of eight hours after
they end.

**Configuration.** `web` refuses to start without the five `FILES_*` the bucket
hands over, naming the first one missing. Without `GAGARIN_TOKEN` it starts
and logs that Speak will only save requests. The `tts` image refuses without
`TEXT_KEY`, `VOICE` and the five `FILES_*`, before importing anything heavy.

| file | what it is |
|---|---|
| `web/app/api/speak/route.ts` | `POST` saves a request and starts its run; `GET` lists requests and their status |
| `web/app/api/audio/[id]/route.ts` | streams `<id>.wav` from the private bucket, with range requests for seeking |
| `web/lib/status.ts` | bucket contents and run state to one status; unit-tested |
| `web/lib/estimate.ts` | the cost estimate the page shows; unit-tested |
| `web/lib/gagarin.ts` | every SDK call the app makes |
| `tts/speak.py` | one run: read, speak, write |
| `tts/fetch_weights.py` | bakes the weights into the image at build time |

`cd web && npm install && npm test` runs the unit tests.

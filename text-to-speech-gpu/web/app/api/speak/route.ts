import { getJson, listObjects, putJson, type ObjectInfo } from '@/lib/bucket'
import { runConfig } from '@/lib/config'
import { MAX_CHARACTERS } from '@/lib/estimate'
import { explain, gagarin, latestRuns, logTail, startRun } from '@/lib/gagarin'
import { ID, jobName, newId } from '@/lib/ids'
import { describe, newestFirst, type ErrorRecord, type Generation, type Manifest, type RunView } from '@/lib/status'
import { DEFAULT_VOICE, isVoice } from '@/lib/voices'

/**
 * POST starts one GPU run per request; GET lists the requests and how each is
 * going. Both are per-request: `next build` runs with no bucket and no token,
 * and must not try to call either.
 */
export const dynamic = 'force-dynamic'

/** How many requests the page lists. */
const LIMIT = 30

const NO_TOKEN =
  'This server has no GAGARIN_TOKEN, so nothing starts a run for it. Run the job by hand; the audio appears here when it lands in the bucket.'

/** What to type to speak a request on this machine instead, under docker compose. */
const byHand = (m: Manifest) => `docker compose run --rm -e TEXT_KEY=${m.id} -e VOICE=${m.voice} tts`

const fail = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status })

// Runs started in the last hour, for RUNS_PER_HOUR. The address is public, so
// anyone who has it can press Speak; this caps what they can start. It is in
// memory because the web is one container: a restart forgets the count, which
// is acceptable for a backstop against a runaway page, not a billing control.
const started: number[] = []

export async function POST(req: Request) {
  let body: { text?: unknown; voice?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'bad_request', 'Send JSON: { "text": "…", "voice": "af_heart" }.')
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return fail(400, 'empty_text', 'Write something to speak.')
  if (text.length > MAX_CHARACTERS) {
    return fail(400, 'text_too_long', `That is ${text.length.toLocaleString('en')} characters; the most is ${MAX_CHARACTERS.toLocaleString('en')}.`)
  }
  const voice = body.voice === undefined ? DEFAULT_VOICE : body.voice
  if (!isVoice(voice)) return fail(400, 'unknown_voice', 'Pick one of the voices on the page.')

  const gg = gagarin()
  const { runsPerHour } = runConfig()
  const hourAgo = Date.now() - 3_600_000
  while (started.length && started[0] < hourAgo) started.shift()
  if (started.length >= runsPerHour) {
    return fail(429, 'hourly_cap', `This server has started its ${runsPerHour} runs for the hour (RUNS_PER_HOUR). Try again later.`)
  }

  const id = newId()
  const manifest: Manifest = { id, text, voice, created_at: new Date().toISOString(), job: jobName(id) }
  try {
    // The request is in the bucket before the run exists: the run reads it from there.
    await putJson(`${id}.json`, manifest)
  } catch {
    return fail(502, 'bucket_unreachable', 'The bucket did not take the request. Check that web reaches files (gg deps ls).')
  }

  // Without a token nothing can start a GPU run. That is the local setup: the
  // request is in the bucket, and the job is run by hand on this machine. (On
  // Gagarin it means the token was never connected: gg deps add speak/web gagarin.)
  if (!gg) {
    started.push(Date.now())
    return Response.json({ id, job: manifest.job, by_hand: byHand(manifest) }, { status: 202 })
  }

  let revision: number
  try {
    revision = await startRun(gg, id, voice)
  } catch (e) {
    const x = explain(e)
    await putJson(`${id}.error`, { message: x.message, at: new Date().toISOString() } satisfies ErrorRecord).catch(() => {})
    return fail(x.status, x.code, x.message)
  }
  started.push(Date.now())
  await putJson(`${id}.json`, { ...manifest, revision }).catch(() => {})
  return Response.json({ id, job: manifest.job, revision }, { status: 202 })
}

interface Files {
  manifest?: ObjectInfo
  audio?: ObjectInfo
  error?: ObjectInfo
}

function index(objects: ObjectInfo[]): Map<string, Files> {
  const by = new Map<string, Files>()
  for (const o of objects) {
    const m = /^(.+)\.(json|wav|error)$/.exec(o.key)
    if (!m || !ID.test(m[1])) continue
    const f = by.get(m[1]) ?? {}
    if (m[2] === 'json') f.manifest = o
    else if (m[2] === 'wav') f.audio = o
    else f.error = o
    by.set(m[1], f)
  }
  return by
}

// A request is written twice: before its run starts, then with the revision.
// After that it never changes, so it is read from the bucket once.
const manifests = new Map<string, Manifest>()

async function manifestOf(id: string): Promise<Manifest | undefined> {
  const cached = manifests.get(id)
  if (cached) return cached
  const m = await getJson<Manifest>(`${id}.json`)
  if (m?.revision !== undefined) manifests.set(id, m)
  return m
}

export async function GET() {
  try {
    return await list()
  } catch {
    // The bucket, almost always: not reachable yet, or web does not reach files.
    return fail(503, 'bucket_unreachable', 'The bucket did not answer. Check that web reaches files (gg deps ls).')
  }
}

async function list() {
  const gg = gagarin()
  let files = index(await listObjects())
  const ids = [...files.keys()]
    .filter((id) => files.get(id)!.manifest)
    .map((id) => ({ id }))
    .sort(newestFirst)
    .slice(0, LIMIT)
    .map((x) => x.id)

  // The platform is asked only about requests the bucket cannot answer, and
  // before the bucket is listed again: a run that reports done wrote its audio
  // before it exited, so a listing taken after the answer sees it.
  let runs: Map<string, RunView> | undefined
  let unknown: string | undefined
  if (ids.some((id) => !files.get(id)!.audio && !files.get(id)!.error)) {
    if (!gg) unknown = NO_TOKEN
    else {
      try {
        runs = await latestRuns(gg)
      } catch (e) {
        unknown = `Could not read the run from Gagarin just now: ${explain(e).message}`
      }
    }
    files = index(await listObjects())
  }

  const now = Date.now()
  const generations = (
    await Promise.all(
      ids.map(async (id): Promise<Generation | undefined> => {
        const f = files.get(id) ?? {}
        const manifest = await manifestOf(id)
        if (!manifest) return undefined
        const error = f.error ? await getJson<ErrorRecord>(`${id}.error`) : undefined
        const { generation, record } = describe({
          manifest,
          audio: f.audio && { at: f.audio.at, bytes: f.audio.bytes },
          error,
          run: runs ? (runs.get(manifest.job) ?? null) : undefined,
          unknown,
          now,
        })
        if (!gg && generation.status === 'pending') generation.by_hand = byHand(manifest)
        if (record) {
          // Written back once, so the card still says why after the run is gone.
          const logs = gg ? await logTail(gg, manifest.job) : undefined
          await putJson(`${id}.error`, { ...record, logs, at: new Date(now).toISOString() }).catch(() => {})
          if (logs) generation.logs = logs
        }
        return generation
      }),
    )
  ).filter((g): g is Generation => g !== undefined)

  return Response.json(
    { generations, can_start: Boolean(gg), runs_per_hour: runConfig().runsPerHour },
    { headers: { 'cache-control': 'no-store' } },
  )
}

/**
 * From what the bucket holds and what the platform says about a run, to the
 * one status a card shows. Pure, so it is tested without a bucket or a token.
 *
 * The bucket is the durable record. A job keeps nothing between runs and the
 * platform removes a finished one-shot run after its TTL, so the run's state is read only while there is no
 * audio yet, and any failure is written back to the bucket as `<id>.error` the
 * first time it is seen: after that the card reads the bucket alone.
 */

export type Status = 'pending' | 'running' | 'done' | 'failed'

/** `<id>.json`, written by POST /api/speak before the run is started. */
export interface Manifest {
  id: string
  text: string
  voice: string
  created_at: string
  job: string
  /** The run's revision, once the platform has accepted it. */
  revision?: number
}

/** `<id>.error`, written by the job when it fails, or by the web when it sees a run fail. */
export interface ErrorRecord {
  message: string
  logs?: string
  at?: string
}

/** What the platform says about a job's latest run: the part of a status row this app reads. */
export interface RunView {
  revision: number
  phase: 'pending' | 'running' | 'done' | 'failed' | 'suspended'
  exit_code?: number
  started_at?: string
  finished_at?: string
  /** The platform's own sentence about it, e.g. that it is waiting for a machine. */
  message?: string
}

export interface Observed {
  manifest: Manifest
  /** `<id>.wav`, when it exists. */
  audio?: { at: string; bytes: number }
  error?: ErrorRecord
  /**
   * The job's latest run. `null`: the platform has no job by that name (not
   * yet, or no longer). `undefined`: it could not be asked, and `unknown` says why.
   */
  run?: RunView | null
  unknown?: string
  now: number
}

export interface Generation {
  id: string
  voice: string
  /** The text's first line, shortened. */
  title: string
  characters: number
  created_at: string
  status: Status
  /** One sentence about the status, for a person. */
  detail: string
  /** Seconds from the request to the audio, or to now while it is not finished. */
  elapsed: number
  /** The end of the log, for a failed run. */
  logs?: string
  /** With no token on the server: the command that speaks it on this machine. */
  by_hand?: string
}

export interface Described {
  generation: Generation
  /**
   * A failure the bucket does not record yet. The caller writes it as
   * `<id>.error` (with the log tail), so the card still says why after the run
   * itself is gone.
   */
  record?: ErrorRecord
}

/** How long after a request a missing job still means "not listed yet". */
export const SUBMIT_GRACE_MS = 2 * 60_000
/** The longest a GPU machine usually takes to come up. */
export const MACHINE_WAIT_MS = 6 * 60_000

export const WAITING_FOR_GPU =
  'Waiting for a GPU machine — three to six minutes the first time; nothing is billed yet.'

const ms = (iso?: string) => (iso ? Date.parse(iso) : NaN)

export function titleOf(text: string, max = 120): string {
  const line = text.trim().split(/\r?\n/, 1)[0].trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

export function describe(o: Observed): Described {
  const { manifest: m, now } = o
  const created = ms(m.created_at)
  const age = Number.isFinite(created) ? now - created : 0
  const since = (end: number) => Math.max(0, Math.round(((Number.isFinite(end) ? end : now) - created) / 1000))

  const base = {
    id: m.id,
    voice: m.voice,
    title: titleOf(m.text),
    characters: m.text.length,
    created_at: m.created_at,
  }
  const card = (status: Status, detail: string, end = now, logs?: string): Generation => ({
    ...base,
    status,
    detail,
    elapsed: since(end),
    ...(logs ? { logs } : {}),
  })
  const fail = (message: string, end = now): Described => ({
    generation: card('failed', message, end),
    record: { message },
  })

  if (o.audio) return { generation: card('done', 'Ready.', ms(o.audio.at)) }
  if (o.error) return { generation: card('failed', o.error.message, ms(o.error.at), o.error.logs) }

  const run = o.run
  if (run === undefined) {
    return { generation: card('pending', o.unknown ?? 'The run’s state cannot be read from here; the audio appears when it lands in the bucket.') }
  }
  if (run === null) {
    if (age < SUBMIT_GRACE_MS) return { generation: card('pending', 'Starting the run…') }
    return fail('The run is gone and no audio arrived, so it cannot say why. Try again.')
  }
  if (m.revision !== undefined && run.revision !== m.revision) {
    return fail(`This request’s run (${m.revision}) was replaced by run ${run.revision} of the same job.`)
  }

  switch (run.phase) {
    case 'pending':
      if (age > MACHINE_WAIT_MS) {
        return {
          generation: card(
            'pending',
            'Still waiting for a GPU machine. Past six minutes it is usually busy with another run — not stuck, and nothing is billed until this one starts.',
          ),
        }
      }
      return { generation: card('pending', WAITING_FOR_GPU) }
    case 'running':
      return { generation: card('running', 'Speaking on the GPU. Billed by the minute from when the run started.') }
    case 'done':
      return fail('The run finished, but no audio arrived in the bucket.', ms(run.finished_at))
    case 'failed':
      return fail(
        run.exit_code !== undefined ? `The run failed with exit code ${run.exit_code}.` : 'The run failed.',
        ms(run.finished_at),
      )
    case 'suspended':
      return fail('The project is suspended, so the run was stopped. Top up the account and try again.')
  }
}

/** Newest first: ids begin with the time, so the id order is the request order. */
export const newestFirst = (a: { id: string }, b: { id: string }) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

export const isActive = (s: Status) => s === 'pending' || s === 'running'

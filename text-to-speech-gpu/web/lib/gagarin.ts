import 'server-only'

import { Gagarin, GagarinError, type Size } from '@gagarin-cloud/sdk'

import { runConfig } from './config'
import { jobName } from './ids'
import type { RunView } from './status'

/**
 * The one place this app talks to Gagarin: starting a run, reading how runs
 * are going, and reading a failed run's log. It never shells out to `gg`.
 */

// The published SDK (0.1.1) types Size as "s" | "m" | "l"; the API takes "g"
// on a run, and the type catches up in the next SDK release.
const GPU = 'g' as string as Size

let client: Gagarin | undefined

/** Undefined when this server holds no GAGARIN_TOKEN (locally, usually). */
export function gagarin(): Gagarin | undefined {
  const { token } = runConfig()
  if (!token) return undefined
  client ??= new Gagarin({ token })
  return client
}

/**
 * Starts the run that speaks request `id`. One job name per request, so a
 * second request never stops the first. A finished job removes itself after
 * its TTL, which frees the name, so the names do not pile up.
 *
 * The TTL is the platform's default, eight hours. A shorter one wants
 * `ttlSeconds: 3600` here, and the published SDK (0.1.1) neither types nor
 * sends it; it comes with the next SDK release. Nothing depends on the run
 * outliving that: the bucket is the record, and a failure is copied into it
 * the first time the page sees one.
 */
export async function startRun(gg: Gagarin, id: string, voice: string): Promise<number> {
  const { project, image } = runConfig()
  const sub = await gg.jobs.run(project, jobName(id), {
    image,
    size: GPU,
    // The job reaches the bucket, and holds its five FILES_* variables, only
    // because this says so. The text travels through the bucket, not the env.
    deps: ['files'],
    env: { TEXT_KEY: id, VOICE: voice },
    // Counted from when the run gets a machine; pulling the image uses some of it.
    timeoutSeconds: 1200,
  })
  return sub.revision
}

/** Every tts-* job's latest run, by job name, from one read of the project's status. */
export async function latestRuns(gg: Gagarin): Promise<Map<string, RunView>> {
  const { project } = runConfig()
  const st = await gg.projects.status(project)
  const runs = new Map<string, RunView>()
  for (const row of st.services) {
    const run = row.actual?.run
    if (row.kind !== 'job' || !row.name.startsWith('tts-') || !run) continue
    runs.set(row.name, {
      revision: run.revision,
      phase: run.phase,
      exit_code: run.exit_code,
      started_at: run.started_at,
      finished_at: run.finished_at,
      message: row.actual.message,
    })
  }
  return runs
}

/** The last lines a job wrote, or undefined if they cannot be read. */
export async function logTail(gg: Gagarin, job: string, lines = 12): Promise<string | undefined> {
  try {
    const { logs } = await gg.jobs.logs(runConfig().project, job, { limit: lines })
    return logs || undefined
  } catch {
    return undefined
  }
}

/** A refusal from the API, as a sentence for the page. Branches on the code, never the prose. */
export function explain(e: unknown): { status: number; code: string; message: string } {
  if (!(e instanceof GagarinError)) {
    return { status: 502, code: 'unreachable', message: 'Gagarin could not be reached. Try again in a moment.' }
  }
  const { image, project } = runConfig()
  switch (e.code) {
    case 'invalid_size':
      return { status: 501, code: e.code, message: 'This Gagarin does not offer the GPU size g yet, so nothing can be spoken.' }
    case 'project_suspended':
    case 'payment_required':
      return { status: 402, code: e.code, message: 'The account is out of credit. Top it up at my.gagarin.cloud/billing, then try again.' }
    case 'unauthorized':
    case 'insufficient_scope':
    case 'insufficient_role':
      return { status: 503, code: e.code, message: 'This server’s Gagarin token cannot start runs: it is expired, revoked, or lacks deploy scope.' }
    case 'image_not_yours':
    case 'image_required':
      return { status: 503, code: e.code, message: `The job image ${image} is not in ${project}’s registry. Build it with gg build ${project}/${image} --context ./tts --push.` }
    case 'project_not_found':
      return { status: 503, code: e.code, message: `This server’s token cannot see a project called ${project}. Check GAGARIN_PROJECT.` }
    case 'no_such_service':
      return { status: 503, code: e.code, message: `${project} has no bucket called files for the run to reach. gg resource add ${project}/files s3 makes it.` }
    case 'rate_limited':
      return { status: 429, code: e.code, message: 'Gagarin asked this server to slow down. Try again in a minute.' }
    default:
      return { status: 502, code: e.code, message: e.message }
  }
}

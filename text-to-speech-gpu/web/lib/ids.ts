/**
 * One id per request, and from it the job name the run is started under.
 *
 * Starting a run on a job stops that job's run still going, so two requests
 * must never share a job name: each gets `tts-<id>`. The id is the time in base
 * 36 (eight characters until 2059, so ids sort in the order they were made)
 * and four random characters. `tts-` plus thirteen is seventeen, inside the
 * platform's `^[a-z][a-z0-9-]{1,29}$`, and nothing a user typed is in it.
 */
export const ID = /^[a-z0-9]{8}-[a-z0-9]{4}$/

export function newId(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  const tail = Array.from(bytes, (b) => (b % 36).toString(36)).join('')
  return `${now.toString(36).padStart(8, '0')}-${tail}`
}

export const jobName = (id: string) => `tts-${id}`
export const idOfJob = (name: string) => (name.startsWith('tts-') ? name.slice(4) : undefined)

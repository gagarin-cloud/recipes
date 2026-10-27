import 'server-only'

/**
 * Everything the app reads from its environment, read at request time.
 *
 * On Gagarin the five FILES_* arrive with `gg deps add speak/web files` and
 * GAGARIN_TOKEN with `gg deps add speak/web gagarin` (an external holding the
 * credential); the deploy itself passes only GAGARIN_PROJECT, TTS_IMAGE and
 * RUNS_PER_HOUR, none of them secret. start.mjs refuses to boot without the
 * bucket, so by the time a route runs they are present.
 */
export function bucketConfig() {
  return {
    endpoint: process.env.FILES_ENDPOINT!,
    region: process.env.FILES_REGION!,
    bucket: process.env.FILES_BUCKET!,
    accessKeyId: process.env.FILES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.FILES_SECRET_ACCESS_KEY!,
  }
}

export function runConfig() {
  return {
    token: process.env.GAGARIN_TOKEN || undefined,
    project: process.env.GAGARIN_PROJECT || 'speak',
    image: process.env.TTS_IMAGE || 'tts:v1',
    /** A ceiling on runs this server starts per hour; the address is public. */
    runsPerHour: Math.max(0, Number(process.env.RUNS_PER_HOUR ?? 30) || 0),
  }
}

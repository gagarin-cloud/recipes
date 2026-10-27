/**
 * The voices this app offers. tts/voices.py lists the same six, and the image
 * bakes exactly those files in, so a voice added here and not there fails the
 * run rather than downloading anything.
 *
 * The first letter of an id is the accent the job's text front end uses:
 * `a` American English, `b` British English.
 */
export interface Voice {
  id: string
  name: string
  accent: 'American' | 'British'
  tone: string
}

export const VOICES: readonly Voice[] = [
  { id: 'af_heart', name: 'Heart', accent: 'American', tone: 'warm, even' },
  { id: 'af_bella', name: 'Bella', accent: 'American', tone: 'bright' },
  { id: 'am_michael', name: 'Michael', accent: 'American', tone: 'calm, low' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'American', tone: 'firm' },
  { id: 'bf_emma', name: 'Emma', accent: 'British', tone: 'clear' },
  { id: 'bm_george', name: 'George', accent: 'British', tone: 'measured' },
]

export const DEFAULT_VOICE = VOICES[0].id

export const isVoice = (v: unknown): v is string =>
  typeof v === 'string' && VOICES.some((x) => x.id === v)

export const voiceName = (id: string) => VOICES.find((v) => v.id === id)?.name ?? id

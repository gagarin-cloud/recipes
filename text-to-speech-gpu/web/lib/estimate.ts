/**
 * What a request will cost, before anyone presses the button.
 *
 * A run at size g is $3 an hour, billed by the minute from when its container
 * starts; waiting for the GPU machine and pulling the image are not billed. So
 * the bill for one request is the minutes between the container starting and
 * the script exiting, and that is mostly fixed overhead: Python starting,
 * torch initialising CUDA, the model moving onto the GPU, the upload. The
 * speech itself is quick on a GPU.
 *
 * None of these numbers are measured on the platform; they are a rule of thumb
 * and the page says so. They are deliberately on the slow side.
 */

export const DOLLARS_PER_HOUR = 3
export const MAX_CHARACTERS = 5000

/** A comfortable reading pace. Speech from the model lands near it. */
export const WORDS_PER_MINUTE = 150
/** Container start to model on the GPU, plus writing the audio back. */
export const OVERHEAD_SECONDS = 45
/** Seconds of speech made per second of GPU time, conservatively. */
export const REALTIME_FACTOR = 30

export interface Estimate {
  words: number
  /** How long the audio will be, roughly. */
  speechSeconds: number
  /** Minutes billed: the run's length, rounded up to the minute. */
  billedMinutes: number
  dollars: number
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}

export function estimate(text: string): Estimate {
  const words = countWords(text)
  const speechSeconds = Math.round((words / WORDS_PER_MINUTE) * 60)
  const runSeconds = OVERHEAD_SECONDS + speechSeconds / REALTIME_FACTOR
  const billedMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(runSeconds / 60))
  return { words, speechSeconds, billedMinutes, dollars: (billedMinutes * DOLLARS_PER_HOUR) / 60 }
}

export function formatDollars(d: number): string {
  return `$${d.toFixed(2)}`
}

/** 0 s, 45 s, 1 min, 2 min 05 s. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `${m} min` : `${m} min ${String(r).padStart(2, '0')} s`
}

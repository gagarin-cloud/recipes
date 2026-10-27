'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { estimate, formatDollars, formatDuration, MAX_CHARACTERS } from '@/lib/estimate'
import { isActive, type Generation, type Status } from '@/lib/status'
import { voiceName, type Voice } from '@/lib/voices'

import s from './Studio.module.css'

const POLL_MS = 5000

interface Listing {
  generations: Generation[]
  can_start: boolean
  runs_per_hour: number
}

const LABEL: Record<Status, string> = {
  pending: 'Waiting',
  running: 'Speaking',
  done: 'Ready',
  failed: 'Failed',
}

export function Studio({ voices }: { voices: readonly Voice[] }) {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(voices[0].id)
  const [listing, setListing] = useState<Listing | undefined>()
  const [loadError, setLoadError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | undefined>()
  const [now, setNow] = useState(() => Date.now())

  const est = useMemo(() => estimate(text), [text])
  const length = text.trim().length
  const tooLong = length > MAX_CHARACTERS
  const active = listing?.generations.some((g) => isActive(g.status)) ?? false

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/speak', { cache: 'no-store' })
      if (!res.ok) throw new Error(`the server answered ${res.status}`)
      setListing(await res.json())
      setLoadError(undefined)
    } catch (e) {
      setLoadError(`Could not load the list: ${(e as Error).message}.`)
    }
  }, [])

  useEffect(() => {
    // The first load, and the poll that follows it while anything is in flight.
    const first = setTimeout(refresh, 0)
    return () => clearTimeout(first)
  }, [refresh])

  useEffect(() => {
    if (!active) return
    const poll = setInterval(refresh, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [active, refresh])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!length || tooLong || submitting) return
    setSubmitting(true)
    setSubmitError(undefined)
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) setSubmitError(body?.error?.message ?? `The server answered ${res.status}.`)
      else setText('')
    } catch {
      setSubmitError('The request did not reach the server. Check the connection and try again.')
    } finally {
      setSubmitting(false)
      setNow(Date.now())
      await refresh()
    }
  }

  return (
    <>
      <form className={s.composer} onSubmit={submit}>
        <label className={s.label} htmlFor="text">
          What should it say?
        </label>
        <textarea
          id="text"
          className={s.text}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a paragraph, a page, an email you would rather listen to…"
          rows={8}
          aria-describedby="count estimate"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit()
          }}
        />
        <div className={s.meta}>
          <span id="count" className={tooLong ? s.over : undefined}>
            {length.toLocaleString('en')} / {MAX_CHARACTERS.toLocaleString('en')} characters
          </span>
          {est.words > 0 && <span>{est.words.toLocaleString('en')} words</span>}
        </div>

        <fieldset className={s.voices}>
          <legend className={s.label}>Voice</legend>
          <div className={s.voiceGrid}>
            {voices.map((v) => (
              <label key={v.id} className={s.voice} data-checked={voice === v.id || undefined}>
                <input type="radio" name="voice" value={v.id} checked={voice === v.id} onChange={() => setVoice(v.id)} />
                <span className={s.voiceName}>{v.name}</span>
                <span className={s.voiceMeta}>
                  {v.accent} · {v.tone}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={s.actions}>
          <p id="estimate" className={s.estimate} aria-live="polite">
            {est.words === 0 ? (
              <>Runs cost $3 an hour, billed by the minute. Most texts take one minute: about $0.05.</>
            ) : (
              <>
                About <strong>{formatDollars(est.dollars)}</strong> for this text, roughly{' '}
                {formatDuration(est.speechSeconds)} of speech. An estimate: {est.billedMinutes}{' '}
                {est.billedMinutes === 1 ? 'minute' : 'minutes'} at $3 an hour.
              </>
            )}
          </p>
          <button className={s.speak} type="submit" disabled={!length || tooLong || submitting}>
            {submitting ? 'Starting…' : 'Speak'}
          </button>
        </div>

        {submitError && (
          <p className={s.alert} role="alert">
            {submitError}
          </p>
        )}
        {listing && !listing.can_start && (
          <p className={s.note}>
            This server has no Gagarin token, so Speak saves the request and nothing starts a GPU
            run. Each card below shows the command that speaks it on this machine.
          </p>
        )}
      </form>

      <section className={s.history} aria-labelledby="history">
        <div className={s.historyHead}>
          <h2 id="history">Generations</h2>
          {active && <span className={s.live}>Checking every 5 seconds</span>}
        </div>
        {loadError && <p className={s.alert}>{loadError}</p>}
        {!listing && !loadError && <p className={s.empty}>Loading…</p>}
        {listing && listing.generations.length === 0 && (
          <p className={s.empty}>Nothing yet. What you speak appears here, newest first.</p>
        )}
        <ol className={s.cards}>
          {listing?.generations.map((g) => (
            <Card key={g.id} g={g} now={now} />
          ))}
        </ol>
      </section>
    </>
  )
}

function Card({ g, now }: { g: Generation; now: number }) {
  const elapsed = isActive(g.status) ? Math.max(g.elapsed, (now - Date.parse(g.created_at)) / 1000) : g.elapsed
  const when = new Date(g.created_at)
  return (
    <li className={s.card} data-status={g.status}>
      <div className={s.cardHead}>
        <span className={s.chip} data-status={g.status}>
          {isActive(g.status) && <span className={s.pulse} aria-hidden />}
          {LABEL[g.status]}
        </span>
        <span className={s.cardMeta}>
          {voiceName(g.voice)} · {g.characters.toLocaleString('en')} chars ·{' '}
          <time dateTime={g.created_at} title={when.toLocaleString()}>
            {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        </span>
      </div>
      <p className={s.cardTitle}>{g.title}</p>

      {g.status === 'done' ? (
        <>
          <audio className={s.player} controls preload="metadata" src={`/api/audio/${g.id}`} />
          <div className={s.cardFoot}>
            <span>Ready in {formatDuration(elapsed)}</span>
            <a className={s.download} href={`/api/audio/${g.id}?download=1`} download={`speak-${g.id}.wav`}>
              Download WAV
            </a>
          </div>
        </>
      ) : (
        <div className={s.cardFoot}>
          <span className={s.detail}>{g.detail}</span>
          <span className={s.elapsed}>{formatDuration(elapsed)}</span>
        </div>
      )}

      {g.by_hand && <code className={s.command}>{g.by_hand}</code>}
      {g.logs && (
        <details className={s.logs}>
          <summary>The last lines the run wrote</summary>
          <pre>{g.logs}</pre>
        </details>
      )}
    </li>
  )
}

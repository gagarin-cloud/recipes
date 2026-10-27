import { Studio } from '@/components/Studio'
import { VOICES } from '@/lib/voices'

/**
 * The whole app is one page. It holds no data of its own: the studio below
 * reads the requests from /api/speak in the browser, so this renders the same
 * for everyone and can be built ahead of time.
 */
export default function Page() {
  return (
    <main className="shell">
      <header className="masthead">
        <p className="eyebrow">Text to speech · one GPU run per request</p>
        <h1>Speak</h1>
        <p className="lede">
          Type or paste up to 5,000 characters and pick a voice. Each request starts its own run on a
          GPU, writes the audio to a bucket, and plays here when it lands.
        </p>
      </header>
      <Studio voices={VOICES} />
      <footer className="colophon">
        <p>
          An open-weights speech model on an NVIDIA L4, started by this page through the Gagarin SDK.
          Runs are billed at $3 an hour by the minute, from when the container starts; waiting for
          the machine is free.
        </p>
      </footer>
    </main>
  )
}

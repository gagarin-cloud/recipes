/**
 * Liveness, and deliberately nothing more: it touches neither the bucket nor
 * Gagarin, so a moment of trouble in either never takes the page away. It says
 * whether this server could start a run, which is the first thing to check
 * when the Speak button refuses.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok', can_start_runs: Boolean(process.env.GAGARIN_TOKEN) })
}

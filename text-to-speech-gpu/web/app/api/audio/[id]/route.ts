import { getObject } from '@/lib/bucket'
import { ID } from '@/lib/ids'

/**
 * The audio, streamed out of the private bucket. The bucket is never made
 * public: listing a public bucket would show every request anyone made, so the
 * app reads it with its own key and hands the bytes on.
 *
 * Range requests are passed through, because a browser's audio player asks
 * for ranges to seek, and Safari will not play a file served without them.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ID.test(id)) return Response.json({ error: { code: 'not_found', message: 'No such audio.' } }, { status: 404 })

  let obj
  try {
    obj = await getObject(`${id}.wav`, req.headers.get('range') ?? undefined)
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 416) return new Response(null, { status: 416 })
    throw e
  }
  if (!obj?.Body) return Response.json({ error: { code: 'not_found', message: 'No audio for that id yet.' } }, { status: 404 })

  const headers = new Headers({
    'content-type': 'audio/wav',
    'accept-ranges': 'bytes',
    // The audio for an id never changes once written.
    'cache-control': 'private, max-age=86400, immutable',
  })
  if (obj.ContentLength !== undefined) headers.set('content-length', String(obj.ContentLength))
  if (obj.ContentRange) headers.set('content-range', obj.ContentRange)
  if (obj.ETag) headers.set('etag', obj.ETag)
  if (new URL(req.url).searchParams.has('download')) {
    headers.set('content-disposition', `attachment; filename="speak-${id}.wav"`)
  }
  return new Response(obj.Body.transformToWebStream(), { status: obj.ContentRange ? 206 : 200, headers })
}

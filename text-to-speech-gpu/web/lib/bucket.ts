import 'server-only'

import {
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'

import { bucketConfig } from './config'

/**
 * The bucket: `<id>.json` (the request), `<id>.wav` (the audio, written by the
 * job), `<id>.error` (why it failed). It is private; the browser never talks to
 * it, and /api/audio/[id] streams the audio through this server.
 */

let client: S3Client | undefined

function s3(): S3Client {
  if (!client) {
    const c = bucketConfig()
    client = new S3Client({
      // Both passed explicitly: left to itself the client looks for AWS.
      endpoint: c.endpoint,
      region: c.region,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      // Path-style works on Gagarin's object storage and on a local stand-in alike.
      forcePathStyle: true,
      // Recent clients add a checksum to every request unless told not to, which
      // not every S3-compatible store accepts.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }
  return client
}

const bucket = () => bucketConfig().bucket

export interface ObjectInfo {
  key: string
  at: string
  bytes: number
}

/** Every object, up to `max`. A key per file, three files per request: plenty for a demo's history. */
export async function listObjects(max = 3000): Promise<ObjectInfo[]> {
  const out: ObjectInfo[] = []
  let token: string | undefined
  do {
    const page = await s3().send(
      new ListObjectsV2Command({ Bucket: bucket(), ContinuationToken: token, MaxKeys: 1000 }),
    )
    for (const o of page.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, at: (o.LastModified ?? new Date()).toISOString(), bytes: o.Size ?? 0 })
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token && out.length < max)
  return out
}

export async function getJson<T>(key: string): Promise<T | undefined> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
    return JSON.parse((await res.Body?.transformToString()) ?? 'null') ?? undefined
  } catch (e) {
    if (e instanceof NoSuchKey) return undefined
    throw e
  }
}

export async function putJson(key: string, value: unknown): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: JSON.stringify(value),
      ContentType: 'application/json',
    }),
  )
}

/** The object, or undefined when there is none. `range` is passed through, for seeking. */
export async function getObject(key: string, range?: string): Promise<GetObjectCommandOutput | undefined> {
  try {
    return await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: range }))
  } catch (e) {
    if (e instanceof NoSuchKey) return undefined
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404) return undefined
    throw e
  }
}

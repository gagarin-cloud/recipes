// The container's entrypoint: refuse to start without the bucket, then hand
// over to Next's standalone server.
//
// The five FILES_* arrive when the service reaches the bucket
// (`gg deps add speak/web files`). Without them every page would load and every
// request would fail, so the container exits naming the first one missing:
// that is what a forgotten dependency should look like.
//
// GAGARIN_TOKEN is not required to start. Without it the app saves requests
// and nothing starts a GPU run for them, which is the local setup; on Gagarin it
// arrives with `gg deps add speak/web gagarin`, and its absence is logged.
const required = [
  'FILES_ENDPOINT',
  'FILES_REGION',
  'FILES_BUCKET',
  'FILES_ACCESS_KEY_ID',
  'FILES_SECRET_ACCESS_KEY',
]

const missing = required.find((k) => !process.env[k])
if (missing) {
  console.error(`speak: ${missing} is not set: the web reaches the bucket through \`gg deps add speak/web files\`, which sets all five FILES_* variables`)
  process.exit(1)
}

if (!process.env.GAGARIN_TOKEN) {
  console.warn('speak: no GAGARIN_TOKEN, so Speak saves requests and starts no GPU runs; on Gagarin, `gg deps add speak/web gagarin`')
}

await import('./server.js')

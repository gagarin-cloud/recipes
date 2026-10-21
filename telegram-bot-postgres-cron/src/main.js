// One image, two jobs. MODE picks which:
//   (unset)  the bot: long-polls Telegram, stores every message, answers
//   digest   the scheduled job: sends each chat what it said in the last day
//
// gagarin hands the image DB_URL (from the postgres called `db`) and
// TELEGRAM_TOKEN (from the external called `telegram`) once the service or job
// declares it needs them with --deps. Nothing else is configured.

import http from 'node:http';

import pg from 'pg';

const TELEGRAM_API = process.env.TELEGRAM_API ?? 'https://api.telegram.org';
const PORT = Number(process.env.PORT ?? 8080);

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. On gagarin it arrives with --deps; locally, put it in .env.`);
    process.exit(1);
  }
  return value;
}

const token = need('TELEGRAM_TOKEN');
const db = new pg.Pool({ connectionString: need('DB_URL'), max: 4 });

async function telegram(method, body) {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id      BIGSERIAL PRIMARY KEY,
      chat_id BIGINT      NOT NULL,
      author  TEXT        NOT NULL,
      text    TEXT        NOT NULL,
      at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await db.query('CREATE INDEX IF NOT EXISTS messages_chat_at ON messages (chat_id, at)');
}

async function handle(message) {
  if (!message?.text) return;
  const author = message.from?.username ?? message.from?.first_name ?? 'someone';
  await db.query('INSERT INTO messages (chat_id, author, text) VALUES ($1, $2, $3)', [
    message.chat.id,
    author,
    message.text,
  ]);
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM messages WHERE chat_id = $1 AND at > now() - interval '1 day'",
    [message.chat.id],
  );
  await telegram('sendMessage', {
    chat_id: message.chat.id,
    text: `Noted. ${rows[0].n} message(s) from this chat today; the digest goes out at 07:00 UTC.`,
  });
}

async function bot() {
  await migrate();

  // The health check answers whether the database does. Telegram being
  // unreachable is logged and retried, not a reason to restart the container.
  http
    .createServer(async (req, res) => {
      if (req.url !== '/healthz') {
        res.writeHead(404).end();
        return;
      }
      try {
        await db.query('SELECT 1');
        res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
      } catch {
        res.writeHead(503, { 'content-type': 'text/plain' }).end('database unreachable\n');
      }
    })
    .listen(PORT, () => console.log(`listening on :${PORT}`));

  let offset = 0;
  for (;;) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: 30 });
      for (const u of updates) {
        offset = u.update_id + 1;
        await handle(u.message).catch((err) => console.error(`message ${u.update_id}: ${err.message}`));
      }
    } catch (err) {
      console.error(`polling: ${err.message}; retrying in 5s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function digest() {
  await migrate();
  const { rows } = await db.query(`
    SELECT chat_id, author, count(*)::int AS n
    FROM messages
    WHERE at > now() - interval '1 day'
    GROUP BY chat_id, author
    ORDER BY chat_id, n DESC`);

  const chats = new Map();
  for (const r of rows) {
    if (!chats.has(r.chat_id)) chats.set(r.chat_id, []);
    chats.get(r.chat_id).push(`${r.author}: ${r.n}`);
  }

  let failed = 0;
  for (const [chatId, lines] of chats) {
    try {
      await telegram('sendMessage', { chat_id: chatId, text: `Yesterday in this chat:\n${lines.join('\n')}` });
    } catch (err) {
      failed++;
      console.error(`chat ${chatId}: ${err.message}`);
    }
  }
  console.log(`digest sent to ${chats.size - failed} of ${chats.size} chat(s)`);
  await db.end();
  // A non-zero exit is what marks the run failed in `gg status`.
  process.exit(failed ? 1 : 0);
}

const mode = process.env.MODE ?? 'bot';
if (mode === 'digest') await digest();
else if (mode === 'bot') await bot();
else {
  console.error(`MODE must be unset (the bot) or "digest", not "${mode}"`);
  process.exit(1);
}

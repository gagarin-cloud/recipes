// A remote MCP server over streamable HTTP, stateless, behind a bearer token.
//
// gagarin hands it AUTH_TOKEN from the external called `auth` once the service
// declares --deps auth. Every request to /mcp must carry
// `Authorization: Bearer <that token>`; /healthz is open so the platform can
// tell whether the process is up.
//
// The one tool is an example. Add yours with server.registerTool below.

import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT = Number(process.env.PORT ?? 8080);
const token = process.env.AUTH_TOKEN;
if (!token || token.length < 32) {
  console.error('AUTH_TOKEN is not set, or shorter than 32 characters. On gagarin it arrives with --deps auth.');
  process.exit(1);
}
const expected = Buffer.from(`Bearer ${token}`);

function authorised(req) {
  const got = Buffer.from(req.headers.authorization ?? '');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function build() {
  const server = new McpServer({ name: 'example', version: '1.0.0' });
  server.registerTool(
    'time_in',
    {
      title: 'Time in a zone',
      description: 'The current date and time in an IANA time zone, such as Europe/Paris.',
      inputSchema: { zone: z.string().describe('IANA time zone, e.g. Asia/Tokyo') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ zone }) => {
      try {
        const now = new Date().toLocaleString('en-GB', { timeZone: zone, dateStyle: 'full', timeStyle: 'long' });
        return { content: [{ type: 'text', text: now }] };
      } catch {
        return { isError: true, content: [{ type: 'text', text: `unknown time zone: ${zone}` }] };
      }
    },
  );
  return server;
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : undefined;
}

http
  .createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
      return;
    }
    if (path !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    if (!authorised(req)) {
      res.writeHead(401, { 'www-authenticate': 'Bearer' }).end();
      return;
    }
    // Stateless: a fresh server and transport per request, so any replica
    // can answer any request and there is no session to lose on a restart.
    const server = build();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.method === 'POST' ? await readJson(req) : undefined);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(400).end();
    }
  })
  .listen(PORT, () => console.log(`listening on :${PORT}`));

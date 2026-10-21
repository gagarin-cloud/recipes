// Answers the two Bot API methods the recipe uses. getUpdates hands out one
// message, once; sendMessage records what was sent, readable at GET /sent.
import http from 'node:http';

const sent = [];
let delivered = false;

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/sent') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(sent));
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const method = req.url.split('/').pop();
      const json = body ? JSON.parse(body) : {};
      let result;
      if (method === 'getUpdates') {
        result = delivered
          ? []
          : [{ update_id: 1, message: { chat: { id: 42 }, from: { username: 'smoke' }, text: 'hello' } }];
        delivered = true;
      } else if (method === 'sendMessage') {
        sent.push(json);
        result = { message_id: sent.length };
      } else {
        res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, description: 'Not Found' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result }));
    });
  })
  .listen(8081);

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

// Kit 3's adapter derives the origin from trusted headers and defaults to HTTPS.
// Set those headers ourselves from a private, validated origin for both local HTTP
// and production behind Caddy. Client-supplied values are always overwritten.
const origin = new URL(
  process.env.ORIGIN ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'
);
if (
  !['http:', 'https:'].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error('ORIGIN deve conter somente protocolo, domínio e porta.');
process.env.PROTOCOL_HEADER = 'x-flora-protocol';
process.env.HOST_HEADER = 'x-flora-host';
process.env.BODY_SIZE_LIMIT ??= '16M';
const {
  handler
}: {
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void
  ) => void | Promise<void>;
} = await import(new URL('../build/handler.js', import.meta.url).href);
const server = http.createServer((request, response) => {
  request.headers['x-flora-protocol'] = origin.protocol.slice(0, -1);
  request.headers['x-flora-host'] = origin.host;
  Promise.resolve(
    handler(request, response, () => {
      response.statusCode = 404;
      response.end('Not found');
    })
  ).catch((error) => {
    console.error('Request failed', error);
    if (!response.headersSent) response.statusCode = 500;
    response.end('Internal server error');
  });
});
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1', () =>
  console.log(`Flor de Cacau: ${origin.origin}`)
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 15_000).unref();
  });

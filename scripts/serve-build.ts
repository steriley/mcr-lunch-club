/**
 * Serves the production build output locally, the way Vercel does: prerendered pages and assets
 * from .vercel/output/static, everything else through the built function.
 *
 *   pnpm build && pnpm serve:build
 *
 * `astro preview` does not support the Vercel adapter and `pnpm dev` skips the Content-Security-Policy,
 * so this is how to see what production sends. It follows .vercel/output/config.json (redirects, the
 * filesystem phase, which routes go to the function) and adds the headers from vercel.json.
 *
 * Listens on the port of BETTER_AUTH_URL (default 4321): Better Auth rejects requests whose origin
 * is not that URL ("Invalid origin"), so sign-in only works on that port.
 *
 *   PORT=4400 pnpm serve:build   serve elsewhere (sign-in will fail unless BETTER_AUTH_URL matches)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import '@/lib/env'; // loads .env.local, so BETTER_AUTH_URL is set below

interface Route {
  src?: string;
  dest?: string;
  headers?: Record<string, string>;
  status?: number;
  continue?: boolean;
  handle?: string;
}

const output = path.resolve('.vercel/output');
const staticDir = path.join(output, 'static');
const functionEntry = path.join(output, 'functions/_render.func/dist/server/entry.mjs');

if (!fs.existsSync(functionEntry)) {
  console.error('No build output found. Run `pnpm build` first.');
  process.exit(1);
}

const routes: Route[] = JSON.parse(
  fs.readFileSync(path.join(output, 'config.json'), 'utf8')
).routes;
const globalHeaders: { source: string; headers: { key: string; value: string }[] }[] =
  fs.existsSync('vercel.json')
    ? (JSON.parse(fs.readFileSync('vercel.json', 'utf8')).headers ?? [])
    : [];
const handler = (await import(pathToFileURL(functionEntry).href)).default as {
  fetch(request: Request): Promise<Response> | Response;
};

const port =
  Number(
    process.env.PORT || new URL(process.env.BETTER_AUTH_URL || 'http://localhost:4321').port
  ) || 4321;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/** The static file Vercel's filesystem phase would serve for this path, if any. */
function staticFile(pathname: string): string | null {
  const clean = path.posix.normalize(decodeURIComponent(pathname));
  if (!clean.startsWith('/') || clean.includes('..')) return null;
  const base = clean.replace(/\/$/, '');
  for (const candidate of [clean, `${base}.html`, `${base}/index.html`]) {
    const file = path.join(staticDir, candidate);
    if (file.startsWith(staticDir) && fs.existsSync(file) && fs.statSync(file).isFile())
      return file;
  }
  return null;
}

function globalHeadersFor(pathname: string): [string, string][] {
  return globalHeaders
    .filter((rule) => new RegExp(`^${rule.source}$`).test(pathname))
    .flatMap((rule) => rule.headers.map((header): [string, string] => [header.key, header.value]));
}

function toRequest(req: http.IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('x-forwarded-for', req.socket.remoteAddress ?? '127.0.0.1');
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}),
  } as RequestInit);
}

function send(
  res: http.ServerResponse,
  status: number,
  headers: Headers,
  body: ReadableStream | Buffer | null
) {
  res.statusCode = status;
  headers.forEach((value, key) => key !== 'set-cookie' && res.setHeader(key, value));
  // Headers.forEach folds Set-Cookie into one value; getSetCookie keeps each cookie separate.
  const cookies = headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  if (!body) return res.end();
  if (Buffer.isBuffer(body)) return res.end(body);
  Readable.fromWeb(body as never).pipe(res);
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises -- the handler catches its own errors
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${port}`}`);
  const extra = new Headers();
  try {
    let target:
      | { kind: 'static'; file: string; status?: number }
      | { kind: 'function' }
      | { kind: 'redirect'; status: number; location: string }
      | null = null;

    for (const route of routes) {
      if (route.handle === 'filesystem') {
        const file = staticFile(url.pathname);
        if (file) {
          target = { kind: 'static', file };
          break;
        }
        continue;
      }
      if (!route.src) continue;
      const match = new RegExp(route.src).exec(url.pathname);
      if (!match) continue;
      for (const [key, value] of Object.entries(route.headers ?? {})) {
        const resolved = value.replace(/\$(\d)/g, (_, n) => match[Number(n)] ?? '');
        if (route.status && key.toLowerCase() === 'location')
          target = { kind: 'redirect', status: route.status, location: resolved };
        else extra.set(key, resolved);
      }
      if (target) break;
      if (route.dest?.startsWith('/')) {
        // The closing catch-all: a prerendered file (404.html) served with the route's status.
        const file = staticFile(route.dest);
        if (file) {
          target = { kind: 'static', file, status: route.status };
          break;
        }
      } else if (route.dest) {
        target = { kind: 'function' };
        break;
      }
    }
    for (const [key, value] of globalHeadersFor(url.pathname)) extra.append(key, value);

    if (target?.kind === 'redirect') {
      extra.set('location', target.location);
      return send(res, target.status, extra, null);
    }
    if (target?.kind === 'static') {
      extra.set('content-type', TYPES[path.extname(target.file)] ?? 'application/octet-stream');
      return send(res, target.status ?? 200, extra, fs.readFileSync(target.file));
    }
    if (target?.kind === 'function') {
      const response = await handler.fetch(toRequest(req, url));
      const headers = new Headers(response.headers);
      extra.forEach((value, key) => !headers.has(key) && headers.set(key, value));
      return send(res, response.status, headers, response.body);
    }

    extra.set('content-type', TYPES['.html']);
    return send(res, 404, extra, Buffer.from('Not Found'));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

server.listen(port, () => console.log(`Serving .vercel/output at http://localhost:${port}`));

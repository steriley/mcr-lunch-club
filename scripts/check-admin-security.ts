/**
 * Checks that every Chairs' Area page and admin API route refuses anonymous
 * requests, that foreign-origin writes are rejected and that public sign-up
 * is disabled. Routes are discovered from src/pages, so new ones are covered.
 *
 *   pnpm check:security                       # against http://localhost:4321
 *   pnpm check:security https://example.com   # against a deployment
 */
import fs from 'node:fs';
import path from 'node:path';

const base = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const SAMPLE_ID = '00000000-0000-4000-8000-000000000000';
let failures = 0;

function report(ok: boolean, label: string, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (${detail})`);
  if (!ok) failures += 1;
}

function routesUnder(directory: string): string[] {
  const root = path.resolve('src/pages');
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(astro|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) results.push(full);
    }
  };
  walk(path.join(root, directory));
  return results.map((file) =>
    '/' +
    path
      .relative(root, file)
      .replace(/\.(astro|ts)$/, '')
      .replace(/(^|\/)index$/, '')
      .replace(/\[[^\]]+\]/g, SAMPLE_ID)
  );
}

async function request(route: string, init: RequestInit = {}) {
  return fetch(base + route, { redirect: 'manual', ...init });
}

for (const route of routesUnder('admin')) {
  const response = await request(route);
  if (route === '/admin/login') {
    report(response.status === 200 && /no-store/.test(response.headers.get('cache-control') ?? ''), `GET ${route} is public, no-store`, String(response.status));
    continue;
  }
  const location = response.headers.get('location') ?? '';
  report(response.status === 302 && location.startsWith('/admin/login'), `GET ${route} redirects to login`, `${response.status} ${location}`);
}

for (const route of routesUnder('api/admin')) {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await request(route, {
      method,
      headers: method === 'GET' ? {} : { Origin: base, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });
    // 401 when the method exists, 404/405 when the route does not handle it.
    const ok = response.status === 401 || response.status === 404 || response.status === 405;
    report(ok, `${method} ${route} refuses anonymous`, String(response.status));
  }
  const foreign = await request(route, {
    method: 'POST',
    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  report(foreign.status === 403, `POST ${route} with foreign Origin -> 403`, String(foreign.status));
}

// The public suggestion form takes anonymous posts, but only from this site.
const foreignSuggestion = await request('/api/suggestions', {
  method: 'POST',
  headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
  body: '{}',
});
report(foreignSuggestion.status === 403, 'POST /api/suggestions with foreign Origin -> 403', String(foreignSuggestion.status));

const signUp = await request('/api/auth/sign-up/email', {
  method: 'POST',
  headers: { Origin: base, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'signup-probe@example.invalid', password: 'probe-password-1234', name: 'Probe' }),
});
report(signUp.status >= 400 && signUp.status < 500, 'public sign-up is disabled', String(signUp.status));

const robots = await (await request('/robots.txt')).text();
report(/Disallow:\s*\/admin/.test(robots), 'robots.txt disallows /admin', robots.trim().replace(/\n/g, ' | '));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

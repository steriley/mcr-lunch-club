import './setup-env';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Helpers for exercising admin API routes without a real database or auth
 * backend. `db` and `auth.api` are shared singletons, so tests swap their
 * methods for stubs and restore them afterwards.
 */

export const SITE = 'https://lunch.example.com';
export const VENUE_ID = '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f';
export const ADMIN = { id: 'admin-1', email: 'chair@example.com', role: 'admin' };

type Mutable = Record<string, any>;

export interface QueryCall {
  method: string;
  args: unknown[];
}

/**
 * A stand-in for a Drizzle query builder: every method returns the builder,
 * and awaiting it resolves to `result` (or rejects when `result` is an Error).
 */
export function fakeQuery(result: unknown = [], calls: QueryCall[] = []) {
  const builder: any = new Proxy(
    {},
    {
      get(_target, property: string) {
        if (property === 'then') {
          return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
            result instanceof Error ? reject(result) : resolve(result);
        }
        return (...args: unknown[]) => {
          calls.push({ method: property, args });
          return builder;
        };
      },
    }
  );
  return { builder, calls };
}

const originals = new Map<string, unknown>();

function patch(target: Mutable, name: string, value: unknown) {
  const key = `${target === (db as Mutable) ? 'db' : 'auth'}.${name}`;
  if (!originals.has(key)) originals.set(key, target[name]);
  target[name] = value;
}

/** Makes `db.<method>()` return a fake query resolving to `result`. */
export function stubDb(method: 'select' | 'insert' | 'update' | 'delete', result: unknown = []) {
  const query = fakeQuery(result);
  patch(db as Mutable, method, () => query.builder);
  return query.calls;
}

/** Makes `db.<method>()` return a different fake result on each call, in order. */
export function stubDbSequence(method: 'select' | 'insert' | 'update' | 'delete', results: unknown[]) {
  const calls: QueryCall[] = [];
  let index = 0;
  patch(db as Mutable, method, () => {
    const query = fakeQuery(results[Math.min(index, results.length - 1)], calls);
    index += 1;
    return query.builder;
  });
  return calls;
}

export function stubAuthApi(name: string, implementation: (options: any) => unknown) {
  const calls: any[] = [];
  patch(auth.api as Mutable, name, async (options: unknown) => {
    calls.push(options);
    return implementation(options);
  });
  return calls;
}

export function signInAs(user: Record<string, unknown> | null = ADMIN) {
  stubAuthApi('getSession', () => (user ? { user, session: { id: 's1' } } : null));
}

export function restoreStubs() {
  for (const [key, original] of originals) {
    const [scope, name] = key.split('.');
    ((scope === 'db' ? db : auth.api) as Mutable)[name] = original;
  }
  originals.clear();
}

/** A same-site request, as sent by the admin UI. */
export function adminRequest(method: string, body?: unknown, init: { origin?: string | null; path?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.origin !== null) headers.origin = init.origin ?? SITE;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`${SITE}${init.path ?? '/api/admin/test'}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Silences expected console.error output from serverError while running `fn`. */
export async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

export const run = (route: Function, context: Record<string, unknown>) => route(context) as Promise<Response>;

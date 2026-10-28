import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_FALLBACK_MS, whenIdle } from './idle';

const g = globalThis as any;

afterEach(() => {
  delete g.window;
});

describe('whenIdle', () => {
  it('uses requestIdleCallback with the timeout, and cancels it', () => {
    const calls: unknown[][] = [];
    let idleCallback: (() => void) | undefined;
    g.window = {
      requestIdleCallback: (cb: () => void, options: unknown) => {
        idleCallback = cb;
        calls.push(['request', options]);
        return 7;
      },
      cancelIdleCallback: (id: number) => calls.push(['cancel', id]),
    };
    let ran = 0;
    const cancel = whenIdle(() => ran++, 1500);
    idleCallback!();
    cancel();
    assert.equal(ran, 1);
    assert.deepEqual(calls, [
      ['request', { timeout: 1500 }],
      ['cancel', 7],
    ]);
  });

  it('falls back to a short timeout without requestIdleCallback, and cancels it', () => {
    const calls: unknown[][] = [];
    g.window = {
      setTimeout: (cb: () => void, ms: number) => {
        calls.push(['set', ms]);
        cb();
        return 3;
      },
      clearTimeout: (id: number) => calls.push(['clear', id]),
    };
    let ran = 0;
    whenIdle(() => ran++)();
    assert.equal(ran, 1);
    assert.deepEqual(calls, [
      ['set', IDLE_FALLBACK_MS],
      ['clear', 3],
    ]);
  });
});

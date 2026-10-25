import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createMapRemover } from './removal';

function fakeMap() {
  const handlers: Record<string, Array<() => void>> = {};
  const calls: string[] = [];
  return {
    calls,
    on(event: string, handler: () => void) { (handlers[event] ??= []).push(handler); return this; },
    once(event: string, handler: () => void) {
      const wrapped = () => { handlers[event] = handlers[event].filter((h) => h !== wrapped); handler(); };
      return this.on(event, wrapped);
    },
    fire(event: string) { for (const handler of [...(handlers[event] ?? [])]) handler(); },
    stop() { calls.push('stop'); return this; },
    remove() { calls.push('remove'); return this; },
  };
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('createMapRemover', () => {
  it('removes straight away when no zoom is animating', () => {
    const map = fakeMap();
    createMapRemover(map)();
    assert.deepEqual(map.calls, ['stop', 'remove']);
  });

  it('waits for an animating zoom to end before removing', () => {
    const map = fakeMap();
    const remove = createMapRemover(map);
    map.fire('zoomanim');
    remove();
    assert.deepEqual(map.calls, ['stop']);
    map.fire('zoomend');
    assert.deepEqual(map.calls, ['stop', 'remove']);
    mock.timers.tick(1000);
    assert.deepEqual(map.calls, ['stop', 'remove'], 'removes once only');
  });

  it('removes after a timeout if the zoom never reports its end', () => {
    const map = fakeMap();
    const remove = createMapRemover(map);
    map.fire('zoomanim');
    remove();
    mock.timers.tick(499);
    assert.deepEqual(map.calls, ['stop']);
    mock.timers.tick(1);
    assert.deepEqual(map.calls, ['stop', 'remove']);
  });

  it('treats a finished zoom as idle', () => {
    const map = fakeMap();
    const remove = createMapRemover(map);
    map.fire('zoomanim');
    map.fire('zoomend');
    remove();
    assert.deepEqual(map.calls, ['stop', 'remove']);
  });
});

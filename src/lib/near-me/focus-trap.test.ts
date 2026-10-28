import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { trapTabKey } from './focus-trap';

function element(name: string) {
  const el: any = {
    name,
    focus: () => {
      (globalThis as any).document.activeElement = el;
    },
  };
  return el;
}

function key(keyName: string, shiftKey = false) {
  let prevented = false;
  return {
    key: keyName,
    shiftKey,
    preventDefault: () => {
      prevented = true;
    },
    get prevented() {
      return prevented;
    },
  } as any;
}

const first = element('first');
const middle = element('middle');
const last = element('last');
const container: any = { querySelectorAll: () => [first, middle, last] };

afterEach(() => {
  delete (globalThis as any).document;
});

describe('trapTabKey', () => {
  it('wraps Tab from the last element to the first', () => {
    (globalThis as any).document = { activeElement: last };
    const event = key('Tab');
    trapTabKey(event, container);
    assert.equal(event.prevented, true);
    assert.equal((globalThis as any).document.activeElement, first);
  });

  it('wraps Shift+Tab from the first element, or the container, to the last', () => {
    for (const start of [first, container]) {
      (globalThis as any).document = { activeElement: start };
      const event = key('Tab', true);
      trapTabKey(event, container);
      assert.equal((globalThis as any).document.activeElement, last);
    }
  });

  it('leaves Tab alone in the middle and ignores other keys', () => {
    (globalThis as any).document = { activeElement: middle };
    const tab = key('Tab');
    trapTabKey(tab, container);
    assert.equal(tab.prevented, false);
    const escape = key('Escape');
    trapTabKey(escape, container);
    assert.equal(escape.prevented, false);
  });

  it('holds focus still when nothing inside can take it', () => {
    (globalThis as any).document = { activeElement: null };
    const event = key('Tab');
    trapTabKey(event, { querySelectorAll: () => [] } as any);
    assert.equal(event.prevented, true);
  });
});

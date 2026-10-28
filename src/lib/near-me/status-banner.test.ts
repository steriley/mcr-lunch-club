import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nearMeStatusBanner, type StatusBannerState } from './status-banner';

const calls: string[] = [];
const actions = {
  startPicking: () => calls.push('startPicking'),
  stopPicking: () => calls.push('stopPicking'),
  close: () => calls.push('close'),
  resumeLive: () => calls.push('resumeLive'),
};

function banner(overrides: Partial<StatusBannerState> = {}) {
  return nearMeStatusBanner(
    {
      devForced: null,
      picking: false,
      geoState: 'active',
      farFromManchester: false,
      manual: false,
      lowAccuracy: false,
      ...overrides,
    },
    actions
  );
}

describe('Near Me status banner', () => {
  it('shows nothing for a good live fix', () => {
    assert.equal(banner(), null);
  });

  it('puts picking a position above everything else', () => {
    const picking = banner({ picking: true, geoState: 'denied', manual: true });
    assert.equal(picking?.text, 'Tap the map to set your position');
    calls.length = 0;
    picking?.action?.handler();
    assert.deepEqual(calls, ['stopPicking']);
  });

  it('offers to set the location by hand when location fails', () => {
    for (const geoState of ['denied', 'unavailable', 'error'] as const) {
      const failed = banner({ geoState });
      assert.equal(failed?.type, 'error');
      assert.equal(failed?.action?.label, 'Set location');
    }
    assert.equal(banner({ geoState: 'requesting' })?.text, 'Acquiring your position…');
  });

  it('flags a far-away live fix, but not a hand-placed one', () => {
    assert.equal(
      banner({ farFromManchester: true })?.text,
      'Outside Manchester · showing Spinningfields'
    );
    assert.equal(banner({ farFromManchester: true, manual: true })?.text, 'Position set manually');
  });

  it('notes low accuracy last', () => {
    assert.equal(banner({ lowAccuracy: true })?.text, 'Location approximate · results may vary');
    assert.equal(banner({ lowAccuracy: true, manual: true })?.type, 'manual');
    assert.equal(banner({ lowAccuracy: true, geoState: 'idle' }), null);
  });

  it('lets the dev override win', () => {
    assert.equal(banner({ devForced: 'far' })?.type, 'warning');
    assert.equal(banner({ devForced: 'nonsense' }), null);
  });
});

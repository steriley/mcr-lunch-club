import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useGeolocation } from './useGeolocation';

const globals = globalThis as any;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

type Success = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Failure = (err: { code: number; message: string; PERMISSION_DENIED: 1; POSITION_UNAVAILABLE: 2; TIMEOUT: 3 }) => void;

let success: Success;
let failure: Failure;
let cleared: number[];
let watchOptions: unknown;

function failWith(code: number, message = '') {
  failure({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
}

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

beforeEach(() => {
  cleared = [];
  globals.window = {};
  setNavigator({
    geolocation: {
      watchPosition: (ok: Success, bad: Failure, options: unknown) => {
        success = ok;
        failure = bad;
        watchOptions = options;
        return 7;
      },
      clearWatch: (id: number) => cleared.push(id),
    },
  });
});

afterEach(() => {
  delete globals.window;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
});

describe('useGeolocation', () => {
  it('starts idle', () => {
    const geo = useGeolocation();
    assert.equal(geo.state.value, 'idle');
    assert.equal(geo.position.value, null);
    assert.equal(geo.isLive.value, false);
  });

  it('requests a high accuracy watch and tracks position updates', () => {
    const geo = useGeolocation();
    geo.start();
    assert.equal(geo.state.value, 'requesting');
    assert.deepEqual(watchOptions, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });

    success({ coords: { latitude: 53.48, longitude: -2.25, accuracy: 20 } });
    assert.equal(geo.state.value, 'active');
    assert.deepEqual(geo.position.value, { lat: 53.48, lng: -2.25, accuracy: 20 });
    assert.equal(geo.isLive.value, true);
    assert.equal(geo.errorMessage.value, null);
  });

  it('does nothing without a window', () => {
    delete globals.window;
    const geo = useGeolocation();
    geo.start();
    assert.equal(geo.state.value, 'idle');
  });

  it('reports when geolocation is unsupported', () => {
    setNavigator({});
    const geo = useGeolocation();
    geo.start();
    assert.equal(geo.state.value, 'unavailable');
    assert.match(geo.errorMessage.value!, /not supported/);
  });

  it('maps geolocation errors to states and messages', () => {
    const geo = useGeolocation();
    geo.start();

    failWith(1);
    assert.equal(geo.state.value, 'denied');
    assert.match(geo.errorMessage.value!, /denied/);

    failWith(2);
    assert.equal(geo.state.value, 'unavailable');
    assert.match(geo.errorMessage.value!, /unavailable/);

    failWith(3);
    assert.equal(geo.state.value, 'error');
    assert.match(geo.errorMessage.value!, /timed out/);

    failWith(99, 'Odd failure');
    assert.equal(geo.state.value, 'error');
    assert.equal(geo.errorMessage.value, 'Odd failure');

    failWith(99);
    assert.match(geo.errorMessage.value!, /unknown error/);
  });

  it('captures exceptions thrown while starting the watch', () => {
    setNavigator({
      geolocation: {
        watchPosition: () => {
          throw new Error('nope');
        },
      },
    });
    const geo = useGeolocation();
    geo.start();
    assert.equal(geo.state.value, 'error');
    assert.equal(geo.errorMessage.value, 'nope');

    setNavigator({
      geolocation: {
        watchPosition: () => {
          throw {};
        },
      },
    });
    geo.start();
    assert.equal(geo.errorMessage.value, 'Failed to start geolocation tracking.');
  });

  it('clears the previous watch when restarting and when stopping', () => {
    const geo = useGeolocation();
    geo.start();
    geo.start();
    assert.deepEqual(cleared, [7]);

    success({ coords: { latitude: 1, longitude: 2, accuracy: 3 } });
    geo.stop();
    assert.deepEqual(cleared, [7, 7]);
    assert.equal(geo.state.value, 'idle');
    assert.equal(geo.position.value, null);
  });

  it('setManualPosition stops live tracking and defaults the accuracy', () => {
    const geo = useGeolocation();
    geo.start();
    geo.setManualPosition({ lat: 1, lng: 2 });
    assert.deepEqual(cleared, [7]);
    assert.equal(geo.isManual.value, true);
    assert.equal(geo.isLive.value, false);
    assert.deepEqual(geo.position.value, { lat: 1, lng: 2, accuracy: 15 });

    geo.setManualPosition({ lat: 3, lng: 4, accuracy: 40 });
    assert.equal(geo.position.value!.accuracy, 40);
  });

  it('resumeLive switches back from a manual position', () => {
    const geo = useGeolocation();
    geo.setManualPosition({ lat: 1, lng: 2 });
    geo.resumeLive();
    assert.equal(geo.isManual.value, false);
    assert.equal(geo.state.value, 'requesting');
  });
});

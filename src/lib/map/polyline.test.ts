import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline } from './polyline';

describe('decodePolyline', () => {
  test('decodes the reference example from the encoded polyline docs', () => {
    assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  test('an empty string has no points', () => {
    assert.deepEqual(decodePolyline(''), []);
  });

  test('a truncated string keeps the whole points decoded before the cut', () => {
    assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLn'), [[38.5, -120.2]]);
  });
});

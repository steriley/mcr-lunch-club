import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDrivingDirectionsUrl, getWalkingDirectionsUrl } from './directions';

describe('getWalkingDirectionsUrl', () => {
  it('generates Apple Maps walking URL for Apple platform', () => {
    const url = getWalkingDirectionsUrl(53.48033, -2.25074, 'MacIntel');
    assert.equal(url, 'https://maps.apple.com/?daddr=53.48033,-2.25074&dirflg=w');
  });

  it('generates Google Maps walking URL for non-Apple platform', () => {
    const url = getWalkingDirectionsUrl(53.48033, -2.25074, 'Linux x86_64');
    assert.equal(
      url,
      'https://www.google.com/maps/dir/?api=1&destination=53.48033,-2.25074&travelmode=walking'
    );
  });
});

describe('getDrivingDirectionsUrl', () => {
  it('generates an Apple Maps driving URL for Apple platforms', () => {
    assert.equal(
      getDrivingDirectionsUrl(53.48033, -2.25074, 'iPhone'),
      'https://maps.apple.com/?daddr=53.48033,-2.25074&dirflg=d'
    );
  });

  it('generates a Google Maps driving URL elsewhere', () => {
    assert.equal(
      getDrivingDirectionsUrl(53.48033, -2.25074, 'Linux x86_64'),
      'https://www.google.com/maps/dir/?api=1&destination=53.48033,-2.25074&travelmode=driving'
    );
  });
});

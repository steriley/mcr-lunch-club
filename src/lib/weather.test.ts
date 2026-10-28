import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeWeather, summarizeWeather } from './weather';

const NOW = Date.parse('2026-10-17T18:30:00Z');

function collection(timeSeries: unknown[], extra: Record<string, unknown> = {}) {
  return { type: 'FeatureCollection', features: [{ properties: { timeSeries } }], ...extra };
}

const hourly = collection([
  { time: '2026-10-17T17:00Z', screenTemperature: 10, feelsLikeTemperature: 9, windSpeed10m: 2, probOfPrecipitation: 4, significantWeatherCode: 7 },
  { time: '2026-10-17T18:00Z', screenTemperature: 11.5, feelsLikeTemperature: 10, windSpeed10m: 3, probOfPrecipitation: 20, significantWeatherCode: 1 },
  ...[19, 20, 21, 22, 23].map((hour, i) => ({
    time: `2026-10-17T${hour}:00Z`,
    screenTemperature: 12 + i,
    significantWeatherCode: 8,
  })),
  ...[0, 1, 2].map((hour, i) => ({
    time: `2026-10-18T0${hour}:00Z`,
    screenTemperature: 17 + i,
    significantWeatherCode: 8,
  })),
]);

const daily = collection([
  { time: '2026-10-16T00:00Z', dayMaxScreenTemperature: 99 },
  {
    time: '2026-10-17T00:00Z',
    dayMaxScreenTemperature: 14,
    nightMinScreenTemperature: 6,
    dayUpperBoundMaxFeelsLikeTemp: 16,
    dayLowerBoundMaxFeelsLikeTemp: 10,
    dayProbabilityOfRain: 30,
    nightProbabilityOfRain: 60,
    midday10MWindSpeed: 4,
    midnight10MWindSpeed: 2,
    daySignificantWeatherCode: 12,
  },
  { time: '2026-10-18T00:00Z', dayMaxScreenTemperature: 13, daySignificantWeatherCode: 15 },
]);

describe('normalizeWeather', () => {
  it('picks the latest hourly entry at or before the reference time as "now"', () => {
    const result = normalizeWeather(hourly, daily, NOW);
    assert.equal(result.now.time, '2026-10-17T18:00Z');
    assert.equal(result.now.temperatureC, 11.5);
    assert.equal(result.now.feelsLikeC, 10);
    assert.equal(result.now.precipitationProbability, 20);
    assert.equal(result.now.condition, 'Sunny');
    assert.equal(result.now.icon, 'sunny');
  });

  it('converts hourly wind from metres per second to mph', () => {
    const result = normalizeWeather(hourly, daily, NOW);
    assert.ok(Math.abs(result.now.windSpeedMph! - 3 * 2.23694) < 1e-9);
  });

  it('returns up to six upcoming hours', () => {
    const result = normalizeWeather(hourly, daily, NOW);
    assert.equal(result.hours.length, 6);
    assert.equal(result.hours[0].time, '2026-10-17T19:00Z');
  });

  it('falls back to the first entry when every entry is in the future', () => {
    const result = normalizeWeather(hourly, daily, Date.parse('2026-10-01T00:00:00Z'));
    assert.equal(result.now.time, '2026-10-17T17:00Z');
  });

  it('drops past days and combines daily measurements', () => {
    const result = normalizeWeather(hourly, daily, NOW);
    assert.equal(result.days.length, 2);
    const today = result.days[0];
    assert.equal(today.temperatureC, 14);
    assert.equal(today.minimumTemperatureC, 6);
    assert.equal(today.feelsLikeC, 13); // midpoint of 10 and 16
    assert.equal(today.precipitationProbability, 60); // worst of day and night
    assert.ok(Math.abs(today.windSpeedMph! - 3 * 2.23694) < 1e-9); // mean of 4 and 2
    assert.equal(today.condition, 'Light rain');
    assert.equal(today.icon, 'light-rain');
  });

  it('returns at most five upcoming days', () => {
    const week = collection(
      Array.from({ length: 8 }, (_, i) => ({ time: `2026-10-${17 + i}T00:00Z`, dayMaxScreenTemperature: i }))
    );
    const result = normalizeWeather(hourly, week, NOW);
    assert.deepEqual(result.days.map((day) => day.temperatureC), [0, 1, 2, 3, 4]);
  });

  it('reports unavailable and unknown conditions', () => {
    const result = normalizeWeather(
      collection([{ time: '2026-10-17T18:00Z' }, { time: '2026-10-17T19:00Z', significantWeatherCode: 99 }]),
      daily,
      Date.parse('2026-10-17T18:30:00Z'),
    );
    assert.equal(result.now.condition, 'Conditions unavailable');
    assert.equal(result.now.temperatureC, null);
    assert.equal(result.now.windSpeedMph, null);
    assert.equal(result.hours[0].condition, 'Mixed conditions');
  });

  it('accepts numeric strings and ignores blank or non-numeric values', () => {
    const result = normalizeWeather(
      collection([{ time: '2026-10-17T18:00Z', screenTemperature: '8.5', feelsLikeTemperature: ' ', windSpeed10m: 'abc' }]),
      daily,
      NOW,
    );
    assert.equal(result.now.temperatureC, 8.5);
    assert.equal(result.now.feelsLikeC, null);
    assert.equal(result.now.windSpeedMph, null);
  });

  it('uses units declared in the parameters block', () => {
    const point = { time: '2026-10-17T18:00Z', screenTemperature: 293.15, windSpeed10m: 10 };
    const parameters = [
      { screenTemperature: { unit: { label: 'kelvin' } }, windSpeed10m: { unit: { symbol: { value: 'km/h' } } } },
    ];
    const result = normalizeWeather({ ...collection([point]), parameters }, daily, NOW);
    assert.ok(Math.abs(result.now.temperatureC! - 20) < 1e-9);
    assert.ok(Math.abs(result.now.windSpeedMph! - 6.21371) < 1e-9);
  });

  it('uses units declared in a metadata block', () => {
    const point = { time: '2026-10-17T18:00Z', screenTemperature: 68, windSpeed10m: 10 };
    const data = {
      features: [{ properties: { timeSeries: [point], units: { screenTemperature: 'Fahrenheit', windSpeed10m: 'knots' } } }],
    };
    const result = normalizeWeather(data, daily, NOW);
    assert.ok(Math.abs(result.now.temperatureC! - 20) < 1e-9);
    assert.ok(Math.abs(result.now.windSpeedMph! - 11.5078) < 1e-9);
  });

  it('treats a plain-string unit and mph wind speeds correctly', () => {
    const data = {
      features: [{ properties: { timeSeries: [{ time: '2026-10-17T18:00Z', windSpeed10m: 7 }], units: 'mph' } }],
    };
    assert.equal(normalizeWeather(data, daily, NOW).now.windSpeedMph, 7);
  });

  it('returns null wind for unknown units', () => {
    const data = {
      features: [{ properties: { timeSeries: [{ time: '2026-10-17T18:00Z', windSpeed10m: 7 }], units: { windSpeed10m: 'furlongs' } } }],
    };
    assert.equal(normalizeWeather(data, daily, NOW).now.windSpeedMph, null);
  });

  it('rejects malformed forecasts', () => {
    assert.throws(() => normalizeWeather(null, daily, NOW), /feature collection/);
    assert.throws(() => normalizeWeather({ features: [] }, daily, NOW), /time series/);
    assert.throws(() => normalizeWeather({ features: [{ properties: {} }] }, daily, NOW), /time series/);
    assert.throws(() => normalizeWeather(collection([]), daily, NOW), /empty/);
    assert.throws(() => normalizeWeather(hourly, { features: [{ properties: { timeSeries: ['x'] } }] }, NOW), /empty/);
  });

  it('skips daily entries with unparseable times', () => {
    const result = normalizeWeather(hourly, collection([{ time: 'garbage' }, { dayMaxScreenTemperature: 1 }]), NOW);
    assert.equal(result.days.length, 0);
  });
});

// Met Office site-specific responses (trimmed to a handful of time steps, parameters block intact),
// in the format https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/{hourly,daily} returns.
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const recordedHourly = fixture('metoffice-hourly.json');
const recordedDaily = fixture('metoffice-daily.json');
const FIXTURE_NOW = Date.parse('2026-10-28T16:30:00Z');

describe('summarizeWeather', () => {
  it('summarises a recorded Met Office forecast', () => {
    const summary = summarizeWeather(recordedHourly, recordedDaily, { referenceTime: FIXTURE_NOW });
    assert.equal(summary.stale, false);
    assert.equal(summary.now.time, '2026-10-28T16:00Z');
    assert.equal(summary.now.temperatureC, 13.86);
    assert.equal(summary.hours.length, 6);
    assert.equal(summary.hours[0].time, '2026-10-28T17:00Z');
    // 27 Oct is past, so four of the five recorded days remain.
    assert.deepEqual(summary.days.map((day) => day.time.slice(0, 10)), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    assert.ok(summary.days.every((day) => day.minimumTemperatureC !== null));
  });

  it('matches normalizeWeather apart from rounding', () => {
    const summary = summarizeWeather(recordedHourly, recordedDaily, { referenceTime: FIXTURE_NOW });
    const full = normalizeWeather(recordedHourly, recordedDaily, FIXTURE_NOW);
    const points = (weather: { now: unknown; hours: unknown[]; days: unknown[] }) => [weather.now, ...weather.hours, ...weather.days];
    const fullPoints = points(full) as typeof full.hours;
    const summaryPoints = points(summary) as typeof full.hours;
    assert.equal(summaryPoints.length, fullPoints.length);
    summaryPoints.forEach((point, index) => {
      const original = fullPoints[index];
      assert.equal(point.time, original.time);
      assert.equal(point.weatherCode, original.weatherCode);
      assert.equal(point.condition, original.condition);
      assert.equal(point.icon, original.icon);
      for (const key of ['temperatureC', 'minimumTemperatureC', 'feelsLikeC', 'precipitationProbability', 'windSpeedMph'] as const) {
        const a = point[key];
        const b = original[key];
        if (b === null) assert.equal(a, null, key);
        else assert.ok(Math.abs(a! - b) <= 0.005 + 1e-9, `${key}: ${a} vs ${b}`);
      }
    });
  });

  it('converts and rounds wind to at most two decimals', () => {
    const summary = summarizeWeather(
      collection([{ time: '2026-10-17T18:00Z', screenTemperature: 11.123456, windSpeed10m: 3.7 }, { time: '2026-10-17T19:00Z' }]),
      daily,
      { referenceTime: NOW },
    );
    assert.equal(summary.now.temperatureC, 11.12);
    assert.equal(summary.now.windSpeedMph, 8.28); // 3.7 m/s
    assert.equal(JSON.stringify(summary).includes('8.276678'), false);
  });

  it('carries the stale flag through and defaults it to false', () => {
    assert.equal(summarizeWeather(hourly, daily, { referenceTime: NOW, stale: true }).stale, true);
    assert.equal(summarizeWeather(hourly, daily, { referenceTime: NOW }).stale, false);
  });

  it('stays under 3KB for a full-length forecast', () => {
    const bytes = Buffer.byteLength(JSON.stringify(summarizeWeather(recordedHourly, recordedDaily, { referenceTime: FIXTURE_NOW })));
    assert.ok(bytes < 3 * 1024, `${bytes} bytes`);
  });

  it('copes with a forecast that has no upcoming hours or days', () => {
    const summary = summarizeWeather(
      collection([{ time: '2026-10-28T16:00Z', screenTemperature: 9, significantWeatherCode: 8 }]),
      collection([{ time: '2026-10-20T00:00Z', dayMaxScreenTemperature: 12 }]),
      { referenceTime: FIXTURE_NOW },
    );
    assert.equal(summary.now.temperatureC, 9);
    assert.deepEqual(summary.hours, []);
    assert.deepEqual(summary.days, []);
  });

  it('throws on empty or malformed input', () => {
    const good = recordedHourly;
    const bad: unknown[] = [
      undefined,
      null,
      'not json',
      [],
      {},
      { features: [] },
      { features: [{ properties: {} }] },
      { features: [{ properties: { timeSeries: 'nope' } }] },
      { features: [{ properties: { timeSeries: [] } }] },
      { features: [{ properties: { timeSeries: [null, 'x', 7] } }] },
    ];
    for (const value of bad) {
      assert.throws(() => summarizeWeather(value, recordedDaily, { referenceTime: FIXTURE_NOW }), Error, `hourly: ${JSON.stringify(value)}`);
      assert.throws(() => summarizeWeather(good, value, { referenceTime: FIXTURE_NOW }), Error, `daily: ${JSON.stringify(value)}`);
    }
  });

  it('tolerates malformed entries inside an otherwise valid series', () => {
    const summary = summarizeWeather(
      collection([null, { time: 5 }, { time: '2026-10-28T16:00Z', screenTemperature: 'warm', significantWeatherCode: 'x' }]),
      collection([{ time: 'garbage' }]),
      { referenceTime: FIXTURE_NOW },
    );
    assert.equal(summary.now.temperatureC, null);
    assert.equal(summary.now.weatherCode, null);
    assert.equal(summary.now.condition, 'Conditions unavailable');
    assert.deepEqual(summary.days, []);
  });
});

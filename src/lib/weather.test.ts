import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeather } from './weather';

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

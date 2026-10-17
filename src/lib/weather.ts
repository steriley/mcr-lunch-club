export type WeatherIcon =
  | 'sunny'
  | 'clear-night'
  | 'partly-cloudy-day'
  | 'partly-cloudy-night'
  | 'overcast'
  | 'fog'
  | 'haze'
  | 'light-drizzle'
  | 'light-rain'
  | 'heavy-rain'
  | 'rain-showers-day'
  | 'rain-showers-night'
  | 'freezing-rain'
  | 'thunderstorm'
  | 'severe-storm'
  | 'snow'
  | 'sleet'
  | 'hail'
  | 'blizzard'
  | 'windy'
  | 'extreme-heat'
  | 'frost'
  | 'tornado'
  | 'system-sync';

export interface WeatherPoint {
  time: string;
  temperatureC: number | null;
  minimumTemperatureC: number | null;
  feelsLikeC: number | null;
  precipitationProbability: number | null;
  windSpeedMph: number | null;
  weatherCode: number | null;
  condition: string;
  icon: WeatherIcon;
}

export interface NormalizedWeather {
  now: WeatherPoint;
  hours: WeatherPoint[];
  days: WeatherPoint[];
}

type UnknownRecord = Record<string, unknown>;

const weatherConditions: Record<number, { condition: string; icon: WeatherIcon }> = {
  0: { condition: 'Clear night', icon: 'clear-night' },
  1: { condition: 'Sunny', icon: 'sunny' },
  2: { condition: 'Partly cloudy night', icon: 'partly-cloudy-night' },
  3: { condition: 'Partly cloudy', icon: 'partly-cloudy-day' },
  5: { condition: 'Mist', icon: 'haze' },
  6: { condition: 'Fog', icon: 'fog' },
  7: { condition: 'Cloudy', icon: 'overcast' },
  8: { condition: 'Overcast', icon: 'overcast' },
  9: { condition: 'Light rain shower', icon: 'rain-showers-day' },
  10: { condition: 'Light rain shower', icon: 'rain-showers-day' },
  11: { condition: 'Drizzle', icon: 'light-drizzle' },
  12: { condition: 'Light rain', icon: 'light-rain' },
  13: { condition: 'Heavy rain shower', icon: 'rain-showers-day' },
  14: { condition: 'Heavy rain shower', icon: 'rain-showers-day' },
  15: { condition: 'Heavy rain', icon: 'heavy-rain' },
  16: { condition: 'Sleet shower', icon: 'sleet' },
  17: { condition: 'Sleet shower', icon: 'sleet' },
  18: { condition: 'Sleet', icon: 'sleet' },
  19: { condition: 'Hail shower', icon: 'hail' },
  20: { condition: 'Hail shower', icon: 'hail' },
  21: { condition: 'Hail', icon: 'hail' },
  22: { condition: 'Light snow shower', icon: 'snow' },
  23: { condition: 'Light snow shower', icon: 'snow' },
  24: { condition: 'Light snow', icon: 'snow' },
  25: { condition: 'Heavy snow shower', icon: 'blizzard' },
  26: { condition: 'Heavy snow shower', icon: 'blizzard' },
  27: { condition: 'Heavy snow', icon: 'blizzard' },
  28: { condition: 'Thunder shower', icon: 'thunderstorm' },
  29: { condition: 'Thunder shower', icon: 'severe-storm' },
  30: { condition: 'Thunder', icon: 'thunderstorm' },
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(record: UnknownRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function unitFor(metadata: UnknownRecord, keys: string[]): string | null {
  if (Array.isArray(metadata.parameters)) {
    for (const parameter of metadata.parameters) {
      if (!isRecord(parameter)) continue;
      for (const key of keys) {
        const definition = parameter[key];
        if (!isRecord(definition) || !isRecord(definition.unit)) continue;
        const label = definition.unit.label;
        const symbol = isRecord(definition.unit.symbol) ? definition.unit.symbol.value : null;
        if (typeof label === 'string') return label.toLowerCase();
        if (typeof symbol === 'string') return symbol.toLowerCase();
      }
    }
  }
  for (const metadataKey of ['units', 'unit', 'metadata']) {
    const units = metadata[metadataKey];
    if (typeof units === 'string') return units.toLowerCase();
    if (!isRecord(units)) continue;
    for (const key of keys) {
      const unit = units[key];
      if (typeof unit === 'string') return unit.toLowerCase();
    }
  }
  return null;
}

function temperatureInCelsius(value: number | null, unit: string | null): number | null {
  if (value === null) return null;
  if (unit?.includes('kelvin') || unit === 'k') return value - 273.15;
  if (unit?.includes('fahrenheit') || unit === 'f' || unit === '°f') return (value - 32) * 5 / 9;
  return value;
}

function windInMph(value: number | null, unit: string | null): number | null {
  if (value === null) return null;
  if (unit?.includes('mph') || unit?.includes('mile')) return value;
  if (unit?.includes('km/h') || unit?.includes('kph')) return value * 0.621371;
  if (unit?.includes('knot')) return value * 1.15078;
  if (unit === null || unit.includes('metre') || unit.includes('meter') || unit === 'm/s') {
    return value * 2.23694;
  }
  return null;
}

function getTimeSeries(data: unknown): { metadata: UnknownRecord; series: UnknownRecord[] } {
  if (!isRecord(data) || !Array.isArray(data.features)) {
    throw new Error('Met Office forecast did not contain a GeoJSON feature collection.');
  }
  const feature = data.features[0];
  if (!isRecord(feature) || !isRecord(feature.properties) || !Array.isArray(feature.properties.timeSeries)) {
    throw new Error('Met Office forecast did not contain a time series.');
  }
  const series = feature.properties.timeSeries.filter(isRecord);
  if (series.length === 0) throw new Error('Met Office forecast time series was empty.');
  return { metadata: { ...feature.properties, parameters: data.parameters }, series };
}

function weatherPoint(record: UnknownRecord, metadata: UnknownRecord, daily: boolean): WeatherPoint {
  const temperatureKeys = daily
    ? ['dayMaxScreenTemperature', 'maxScreenAirTemp', 'dayMaxScreenAirTemp', 'dayMaxTemp', 'maxTemperature', 'screenTemperature']
    : ['screenTemperature', 'temperature'];
  const feelsLikeKeys = daily
    ? ['dayUpperBoundMaxFeelsLikeTemp', 'dayLowerBoundMaxFeelsLikeTemp', 'dayMaxFeelsLikeTemp', 'feelsLikeTemp', 'feelsLikeTemperature', 'dayFeelsLikeTemp']
    : ['feelsLikeTemperature', 'feelsLikeTemp'];
  const precipitationKeys = daily
    ? ['dayProbabilityOfRain', 'nightProbabilityOfRain', 'dayProbabilityOfPrecipitation', 'probOfPrecipitation', 'probabilityOfPrecipitation']
    : ['probOfPrecipitation', 'probabilityOfPrecipitation'];
  const windKeys = daily
    ? ['midday10MWindSpeed', 'midnight10MWindSpeed', 'windSpeed10m', 'dayMaxWindSpeed', 'dayMax10mWindGust', 'max10mWindGust']
    : ['windSpeed10m', 'windSpeed'];
  const weatherCodeKeys = daily
    ? ['daySignificantWeatherCode', 'significantWeatherCode', 'nightSignificantWeatherCode']
    : ['significantWeatherCode', 'weatherCode'];
  const weatherCode = numberValue(record, weatherCodeKeys);
  const condition = weatherCode === null
    ? { condition: 'Conditions unavailable', icon: 'overcast' as const }
    : weatherConditions[weatherCode] ?? { condition: 'Mixed conditions', icon: 'overcast' as const };
  const temperatureValues = temperatureKeys
    .map((key) => numberValue(record, [key]))
    .filter((value): value is number => value !== null);
  const feelsLikeValues = feelsLikeKeys
    .map((key) => numberValue(record, [key]))
    .filter((value): value is number => value !== null);
  const precipitationValues = precipitationKeys
    .map((key) => numberValue(record, [key]))
    .filter((value): value is number => value !== null);
  const windValues = windKeys
    .map((key) => numberValue(record, [key]))
    .filter((value): value is number => value !== null);
  const dailyMinimum = daily ? numberValue(record, ['nightMinScreenTemperature']) : null;
  const feelsLike = daily && feelsLikeValues.length > 1
    ? (Math.min(...feelsLikeValues) + Math.max(...feelsLikeValues)) / 2
    : (feelsLikeValues[0] ?? null);
  const precipitation = daily && precipitationValues.length > 1
    ? Math.max(...precipitationValues)
    : (precipitationValues[0] ?? null);
  const windSpeed = daily && windValues.length > 1
    ? (windValues.reduce((total, value) => total + value, 0) / windValues.length)
    : (windValues[0] ?? null);

  return {
    time: typeof record.time === 'string' ? record.time : '',
    temperatureC: temperatureInCelsius(
      temperatureValues[0] ?? null,
      unitFor(metadata, temperatureKeys),
    ),
    minimumTemperatureC: temperatureInCelsius(
      dailyMinimum,
      unitFor(metadata, ['nightMinScreenTemperature']),
    ),
    feelsLikeC: temperatureInCelsius(
      feelsLike,
      unitFor(metadata, feelsLikeKeys),
    ),
    precipitationProbability: precipitation,
    windSpeedMph: windInMph(windSpeed, unitFor(metadata, windKeys)),
    weatherCode,
    condition: condition.condition,
    icon: condition.icon,
  };
}

function dateInManchester(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function normalizeWeather(
  hourlyData: unknown,
  dailyData: unknown,
  referenceTime = Date.now(),
): NormalizedWeather {
  const hourly = getTimeSeries(hourlyData);
  const daily = getTimeSeries(dailyData);
  const currentIndex = hourly.series.reduce((latestIndex, record, index) => {
    const time = typeof record.time === 'string' ? Date.parse(record.time) : Number.NaN;
    return Number.isFinite(time) && time <= referenceTime ? index : latestIndex;
  }, -1);
  const nowIndex = currentIndex < 0 ? 0 : currentIndex;
  const currentDate = dateInManchester(new Date(referenceTime).toISOString());
  const upcomingDays = daily.series.filter((record) => {
    if (typeof record.time !== 'string' || !currentDate) return false;
    const date = dateInManchester(record.time);
    return date !== null && date >= currentDate;
  });
  return {
    now: weatherPoint(hourly.series[nowIndex], hourly.metadata, false),
    hours: hourly.series.slice(nowIndex + 1, nowIndex + 7).map((record) => weatherPoint(record, hourly.metadata, false)),
    days: upcomingDays.slice(0, 5).map((record) => weatherPoint(record, daily.metadata, true)),
  };
}

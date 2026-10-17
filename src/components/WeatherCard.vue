<template>
  <section class="weather-card" aria-label="Manchester weather forecast" aria-live="polite">
    <p v-if="loading" class="weather-state">Checking conditions over Manchester…</p>
    <p v-else-if="error" class="weather-state is-error">Weather unavailable. Please try again later.</p>
    <p v-else-if="!weather" class="weather-state">No forecast is currently available.</p>
    <template v-else>
      <div class="weather-current">
        <span class="weather-condition-icon" aria-hidden="true">{{ iconFor(weather.now.icon) }}</span>
        <div class="weather-current-copy">
          <strong class="weather-temperature">{{ formatTemperature(weather.now.temperatureC) }}</strong>
          <span class="weather-condition">{{ weather.now.condition }}</span>
          <span class="weather-current-details">
            Feels like {{ formatTemperature(weather.now.feelsLikeC) }}
            <span aria-hidden="true">·</span>
            Rain {{ formatPercent(weather.now.precipitationProbability) }}
            <span aria-hidden="true">·</span>
            Wind {{ formatWind(weather.now.windSpeedMph) }}
          </span>
        </div>
      </div>

      <div v-if="weather.hours.length" class="weather-forecast-block">
        <h3>Next hours</h3>
        <ul class="weather-hour-list">
          <li v-for="(hour, index) in weather.hours" :key="hour.time || `hour-${index}`">
            <time :datetime="hour.time">{{ formatTime(hour.time) }}</time>
            <span class="weather-forecast-icon" aria-hidden="true">{{ iconFor(hour.icon) }}</span>
            <span class="sr-only">{{ hour.condition }}</span>
            <strong>{{ formatTemperature(hour.temperatureC) }}</strong>
            <span class="weather-hour-rain">Rain {{ formatPercent(hour.precipitationProbability) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="weather.days.length" class="weather-forecast-block">
        <h3>Next days</h3>
        <ul class="weather-day-list">
          <li v-for="day in weather.days" :key="day.time">
            <time :datetime="day.time">{{ formatDay(day.time) }}</time>
            <span class="weather-forecast-icon" aria-hidden="true">{{ iconFor(day.icon) }}</span>
            <span class="sr-only">{{ day.condition }}</span>
            <strong :aria-label="`High ${formatTemperature(day.temperatureC)}, low ${formatTemperature(day.minimumTemperatureC)}`">
              {{ formatTemperature(day.temperatureC) }} / {{ formatTemperature(day.minimumTemperatureC) }}
            </strong>
            <span class="weather-day-condition">{{ day.condition }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { normalizeWeather, type NormalizedWeather, type WeatherIcon } from '@/lib/weather';

const loading = ref(true);
const error = ref(false);
const weather = ref<NormalizedWeather | null>(null);

const weatherIcons: Record<WeatherIcon, string> = {
  sun: '☀',
  moon: '☾',
  'partly-cloudy': '⛅',
  cloud: '☁',
  fog: '🌫',
  rain: '🌧',
  sleet: '🌨',
  snow: '❄',
  hail: '🧊',
  thunder: '⛈',
};

function iconFor(icon: WeatherIcon): string {
  return weatherIcons[icon];
}

function formatTemperature(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}°C`;
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

function formatWind(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} mph`;
}

function parseTime(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string): string {
  const date = parseTime(value);
  return date ? new Intl.DateTimeFormat('en-GB', { hour: 'numeric' }).format(date) : '—';
}

function formatDay(value: string): string {
  const date = parseTime(value);
  return date ? new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date) : '—';
}

onMounted(async () => {
  try {
    const [hourlyResponse, dailyResponse] = await Promise.all([
      fetch('/api/weather/hourly'),
      fetch('/api/weather/daily'),
    ]);
    if (!hourlyResponse.ok || !dailyResponse.ok) {
      throw new Error('Weather service is unavailable.');
    }
    const [hourlyData, dailyData]: [unknown, unknown] = await Promise.all([
      hourlyResponse.json(),
      dailyResponse.json(),
    ]);
    weather.value = normalizeWeather(hourlyData, dailyData);
    if (weather.value.hours.length === 0 && weather.value.days.length === 0) {
      weather.value = null;
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.weather-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
}

.weather-state {
  margin: auto 0;
  color: #666974;
  font-size: 11px;
  line-height: 1.4;
}

.weather-state.is-error {
  color: #8a5100;
}

.weather-current {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 1px 0 7px;
  border-bottom: 1px solid rgb(213 204 183 / 55%);
}

.weather-condition-icon {
  display: grid;
  flex: 0 0 39px;
  width: 39px;
  height: 39px;
  place-items: center;
  border: 1px solid var(--ledger-border);
  border-radius: 9px;
  background: var(--ledger-paper);
  color: var(--ledger-deep);
  font-size: 21px;
}

.weather-current-copy {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 1px 7px;
  min-width: 0;
}

.weather-temperature {
  grid-row: span 2;
  color: var(--ledger-deep);
  font-size: 23px;
  line-height: 1;
}

.weather-condition {
  overflow: hidden;
  color: var(--ledger-ink);
  font-size: 10px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.weather-current-details {
  grid-column: 2;
  color: #666974;
  font-size: 8px;
  line-height: 1.4;
}

.weather-current-details > span {
  margin-inline: 2px;
  color: #9a907c;
}

.weather-forecast-block {
  min-width: 0;
}

.weather-forecast-block h3 {
  margin: 0 0 5px;
  color: #666974;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.weather-hour-list,
.weather-day-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.weather-hour-list {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.weather-hour-list li,
.weather-day-list li {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: 3px 2px;
  color: var(--ledger-deep);
  text-align: center;
}

.weather-hour-list li + li,
.weather-day-list li + li {
  border-left: 1px solid rgb(213 204 183 / 50%);
}

.weather-hour-list time,
.weather-day-list time {
  color: #666974;
  font-size: 8px;
  white-space: nowrap;
}

.weather-forecast-icon {
  min-height: 19px;
  color: var(--ledger-deep);
  font-size: 14px;
  line-height: 19px;
}

.weather-hour-list strong,
.weather-day-list strong {
  color: var(--ledger-deep);
  font-size: 9px;
}

.weather-hour-rain,
.weather-day-condition {
  overflow: hidden;
  max-width: 100%;
  color: #666974;
  font-size: 7px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.weather-day-list {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-top: 1px solid rgb(213 204 183 / 50%);
}

.weather-day-list li {
  padding-top: 5px;
}
</style>

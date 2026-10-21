<template>
  <section
    class="weather-card"
    :class="`theme-${themeFor(currentIcon)}`"
    aria-label="Manchester weather forecast"
    aria-live="polite"
  >
    <header class="weather-card-header">
      <div class="weather-card-brand">
        <svg class="weather-header-icon" viewBox="0 0 24 24" aria-hidden="true">
          <template v-for="(shape, index) in weatherIcons[currentIcon]" :key="index">
            <path v-if="shape.kind === 'path'" :d="shape.d" />
            <circle
              v-else
              :cx="shape.cx"
              :cy="shape.cy"
              :r="shape.r"
              :fill="shape.filled ? 'currentColor' : 'none'"
            />
          </template>
        </svg>
        <span>Atmospheric Dispatch</span>
      </div>
      <span class="weather-card-window">12:00 - 14:30</span>
    </header>

    <div v-if="loading || error || !weather" class="weather-card-state">
      <div class="weather-icon-tile" aria-hidden="true">
        <svg class="weather-condition-icon" :class="{ 'is-loading': loading }" viewBox="0 0 24 24">
          <template v-for="(shape, index) in weatherIcons[currentIcon]" :key="index">
            <path v-if="shape.kind === 'path'" :d="shape.d" />
            <circle
              v-else
              :cx="shape.cx"
              :cy="shape.cy"
              :r="shape.r"
              :fill="shape.filled ? 'currentColor' : 'none'"
            />
          </template>
        </svg>
      </div>
      <div>
        <h3>{{ loading ? 'System Sync' : error ? 'Met Office Wire Snapped' : 'Parish Boundary Unknown' }}</h3>
        <p>{{ loading ? 'Checking conditions over Manchester.' : error ? 'Assume persistent drizzle as statutory default. Equip galoshes regardless. Please try again later.' : 'Geolocation suppressed. Defaulting synoptic vector to Manchester Town Hall flagpole.' }}</p>
      </div>
    </div>

    <template v-else>
      <div class="weather-current">
        <div class="weather-icon-tile" aria-hidden="true">
          <svg class="weather-condition-icon" viewBox="0 0 24 24">
            <template v-for="(shape, index) in weatherIcons[currentIcon]" :key="index">
              <path v-if="shape.kind === 'path'" :d="shape.d" />
              <circle
                v-else
                :cx="shape.cx"
                :cy="shape.cy"
                :r="shape.r"
                :fill="shape.filled ? 'currentColor' : 'none'"
              />
            </template>
          </svg>
        </div>
        <div class="weather-current-copy">
          <h3>{{ dispatch?.title }} <span>·</span> {{ formatTemperature(weather.now.temperatureC) }}</h3>
          <p>{{ dispatch?.quip }}</p>
        </div>
      </div>

      <footer class="weather-card-footer">
        <span>Wind: {{ formatWind(weather.now.windSpeedMph) }}</span>
        <span
          class="weather-rain"
          :class="{ 'is-warning': weather.now.precipitationProbability !== null && weather.now.precipitationProbability >= 50 }"
        >
          Rain {{ formatPercent(weather.now.precipitationProbability) }}
        </span>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { normalizeWeather, type NormalizedWeather, type WeatherIcon, type WeatherPoint } from '@/lib/weather';

type WeatherShape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; filled?: boolean };

const loading = ref(true);
const error = ref(false);
const stale = ref(false);
const weather = ref<NormalizedWeather | null>(null);

const weatherIcons: Record<WeatherIcon, WeatherShape[]> = {
  sunny: [
    { kind: 'circle', cx: 12, cy: 12, r: 4.5 },
    { kind: 'path', d: 'M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.28 5.28l1.77 1.77M16.95 16.95l1.77 1.77M5.28 18.72l1.77-1.77M16.95 7.05l1.77-1.77' },
  ],
  'clear-night': [{ kind: 'path', d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
  'partly-cloudy-day': [
    { kind: 'path', d: 'M12 4v2M4.9 7.1l1.4 1.4M18.4 8.6l1.4-1.4M16.5 10a4 4 0 0 0-7.3-1.6' },
    { kind: 'path', d: 'M17.5 19H9a5 5 0 0 1-.3-10 6 6 0 0 1 11.3 2A4 4 0 0 1 17.5 19Z' },
  ],
  'partly-cloudy-night': [
    { kind: 'path', d: 'M11 6a4.5 4.5 0 0 0 5 4.9A4.5 4.5 0 0 1 11.5 18H8a5 5 0 0 1-.3-10 5.8 5.8 0 0 1 3.3-2Z' },
    { kind: 'path', d: 'M17.5 19H9a5 5 0 0 1-.3-10 6 6 0 0 1 11.3 2A4 4 0 0 1 17.5 19Z' },
  ],
  overcast: [{ kind: 'path', d: 'M6 18a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 18H6Z' }],
  fog: [{ kind: 'path', d: 'M4 8h16M3 12h18M5 16h14M7 20h10' }],
  haze: [{ kind: 'path', d: 'M12 5a3.5 3.5 0 0 0-3.5 3.5M15.5 8.5A3.5 3.5 0 0 0 12 5M3 13h18M4 17h16M7 21h10' }],
  'light-drizzle': [{ kind: 'path', d: 'M12 3C8 8.5 7 11 7 14a5 5 0 0 0 10 0c0-3-1-5.5-5-11Z' }],
  'light-rain': [
    { kind: 'path', d: 'M7 16a4 4 0 0 1-.5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 16H7Z' },
    { kind: 'path', d: 'M9 19v2M13 19v2M17 19v2' },
  ],
  'heavy-rain': [
    { kind: 'path', d: 'M6 14a4 4 0 0 1-.5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 14H6Z' },
    { kind: 'path', d: 'M8 17l-1.5 4M12 17l-1.5 4M16 17l-1.5 4' },
  ],
  'rain-showers-day': [
    { kind: 'path', d: 'M12 3v2M4.9 6.5l1.4 1.4M16.5 8a4 4 0 0 0-6.8-1' },
    { kind: 'path', d: 'M16 15a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-8.9.5A3.5 3.5 0 0 0 5 15h11Z' },
    { kind: 'path', d: 'M9 18l-1 3M13 18l-1 3' },
  ],
  'rain-showers-night': [
    { kind: 'path', d: 'M10 4a3.8 3.8 0 0 0 4.5 4.5' },
    { kind: 'path', d: 'M16 15a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-8.9.5A3.5 3.5 0 0 0 5 15h11Z' },
    { kind: 'path', d: 'M9 18l-1 3M13 18l-1 3' },
  ],
  'freezing-rain': [
    { kind: 'path', d: 'M6 14a4 4 0 0 1-.5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 14H6Z' },
    { kind: 'path', d: 'M9 17v4M15 17v4M12 17.5v3M10.5 19h3' },
  ],
  thunderstorm: [
    { kind: 'path', d: 'M6 14a4 4 0 0 1-.5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 14H6Z' },
    { kind: 'path', d: 'M13 14l-2 4h3l-2 4' },
  ],
  'severe-storm': [
    { kind: 'path', d: 'M6 13a4 4 0 0 1-.5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 13H6Z' },
    { kind: 'path', d: 'M10 14l-2 4h3l-2 4M15 14l-1.5 3h2.5l-2 4' },
  ],
  snow: [
    { kind: 'path', d: 'M6 13a4 4 0 0 1-.5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 13H6Z' },
    { kind: 'path', d: 'M9 16.5h.01M15 16.5h.01M12 18.5h.01M9 20.5h.01M15 20.5h.01' },
  ],
  sleet: [
    { kind: 'path', d: 'M6 14a4 4 0 0 1-.5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 14H6Z' },
    { kind: 'path', d: 'M8 17l-1 3M12 18h.01M16 17l-1 3' },
  ],
  hail: [
    { kind: 'path', d: 'M6 14a4 4 0 0 1-.5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 18 14H6Z' },
    { kind: 'circle', cx: 8, cy: 19, r: 1, filled: true },
    { kind: 'circle', cx: 12, cy: 18, r: 1, filled: true },
    { kind: 'circle', cx: 16, cy: 20, r: 1, filled: true },
  ],
  blizzard: [
    { kind: 'path', d: 'M4 10h16M3 14h14M7 18h12' },
    { kind: 'circle', cx: 18, cy: 14, r: 1, filled: true },
    { kind: 'circle', cx: 9, cy: 6, r: 1, filled: true },
  ],
  windy: [{ kind: 'path', d: 'M4 9h12a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M5 17h8a2 2 0 1 0-2-2' }],
  'extreme-heat': [
    { kind: 'path', d: 'M12 4v7M12 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z' },
    { kind: 'path', d: 'M10 4a2 2 0 1 1 4 0v10.3a3.5 3.5 0 1 1-4 0V4Z' },
    { kind: 'path', d: 'M18 7l2-1M18 11h2' },
  ],
  frost: [{ kind: 'path', d: 'M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07M12 6l2-2M12 6l-2-2M18 12l2-2M18 12l2 2' }],
  tornado: [{ kind: 'path', d: 'M3 5h18M5 9h14M7 13h10M9 17h6M11 21h2' }],
  'system-sync': [{ kind: 'path', d: 'M21 12a9 9 0 1 1-6.219-8.56' }],
};

interface WeatherDispatch {
  icon: WeatherIcon;
  title: string;
  quip: string;
}

const dispatchCopy: Record<WeatherIcon, Omit<WeatherDispatch, 'icon'>> = {
  sunny: {
    title: 'Solar Anomaly: Direct Glare',
    quip: 'Outdoor benches at St Peter’s Sq declared viable. Squinting permitted.',
  },
  'clear-night': {
    title: 'Nocturnal Vault: Cloudless',
    quip: 'Infrared radiation bleed into stratosphere. Overcoat buttoning enforced.',
  },
  'partly-cloudy-day': {
    title: 'Intermittent Cumulus Drift',
    quip: 'Brief sunglasses usage tolerated; trench coat retainment advisable.',
  },
  'partly-cloudy-night': {
    title: 'Fractured Stratum: Dusk',
    quip: 'Pavement dry spots rapidly vanishing. Proceed briskly to tavern.',
  },
  overcast: {
    title: 'Cottonopolis Blanket',
    quip: 'Standard ceiling 800ft. Pasty pastry crispness degrades within 7 minutes.',
  },
  fog: {
    title: 'Irwell Basin Vapor Inversion',
    quip: 'Visibility restricted to 80 paces. Beacons at Trinity Bridge active.',
  },
  haze: {
    title: 'Particulate Suspension: Haze',
    quip: 'Diffused warm grays. Roast pork barm vendors report increased scent linger.',
  },
  'light-drizzle': {
    title: 'MCR Drizzle: Moderate',
    quip: '10–min umbrella bound strictly recommended.',
  },
  'light-rain': {
    title: 'Steady Northern Pluvial',
    quip: 'Continuous bead accumulation. Waxed cotton jacket designated obligatory.',
  },
  'heavy-rain': {
    title: 'Torrential Cobblestone Scour',
    quip: 'Basement café soup runs only. Puddle depths exceeding welt limits.',
  },
  'rain-showers-day': {
    title: 'Pennine Sun-Shower Skirmish',
    quip: 'Direct sunlight accompanied by sharp horizontal stinging pellets.',
  },
  'rain-showers-night': {
    title: 'Late-Hours Squall Cycle',
    quip: 'Neon reflections intense on damp tarmac. Fast-track kebab transit sanctioned.',
  },
  'freezing-rain': {
    title: 'Vitreous Ice Glaze Event',
    quip: 'Supercooled droplets bonding to flagstones. Leather soles strictly suspended.',
  },
  thunderstorm: {
    title: 'Salford Cell: Electrical Flash',
    quip: 'Metallic umbrellas constitute lightning aerials. Fold down immediately.',
  },
  'severe-storm': {
    title: 'Monsoonal Gale & Flash Surge',
    quip: 'Canal towpath transit forbidden under pain of sodden socks and committee fine.',
  },
  snow: {
    title: 'Flurry Dispersal',
    quip: 'Immediate thaw upon granite contact. Slush build-up imminent.',
  },
  sleet: {
    title: 'Semi-Melted Slag',
    quip: 'Worst of both realms. Facial stinging index currently peak.',
  },
  hail: {
    title: 'Pellet Bombardment',
    quip: 'Canopy drum acoustics deafening. Flat caps provide insufficient shielding.',
  },
  blizzard: {
    title: 'Pennine Blizzard: Severe Drift',
    quip: 'Emergency ration protocol activated. Pasty deliveries halted over Snake Pass.',
  },
  windy: {
    title: 'Deansgate Wind Funnel',
    quip: 'Inversion of cheap telescopic brollies guaranteed within 15 meters.',
  },
  'extreme-heat': {
    title: 'Manchester Heatwave: 29°C',
    quip: 'Unprecedented panic. Chilled gazpacho protocol ratified by committee.',
  },
  frost: {
    title: 'Rime Frost & Black Ice',
    quip: 'Cobblestones glazed like oven-fired buns. Penguin waddle pace declared legal standard.',
  },
  tornado: {
    title: 'Trafford Vortex Spout',
    quip: 'Micro-cyclonic rotation over ship canal. Tether all wheelie bins without delay.',
  },
  'system-sync': {
    title: 'System Sync',
    quip: 'Fetching the latest Manchester dispatch.',
  },
};

const dispatch = computed(() => weather.value ? dispatchFor(weather.value.now, stale.value) : null);
const currentIcon = computed<WeatherIcon>(() => dispatch.value?.icon ?? (loading.value ? 'system-sync' : 'overcast'));

function isNightInManchester(time: string): boolean {
  const timestamp = Date.parse(time);
  if (!Number.isFinite(timestamp)) return false;
  // dates-guard:allow reads the London hour to pick a night icon; nothing here is displayed
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestamp)));
  return hour >= 18 || hour < 6;
}

function dispatchFor(point: WeatherPoint, cached: boolean): WeatherDispatch {
  if (cached) {
    return {
      icon: 'light-rain',
      title: 'Cached Ledger: Rain Likely',
      quip: 'Telegram receiver unpowered. Historic probability indicates high chance of precipitation.',
    };
  }

  const code = point.weatherCode;
  if (code === null || point.condition === 'Mixed conditions') {
    return {
      icon: 'overcast',
      title: 'Parish Boundary Unknown',
      quip: 'Geolocation suppressed. Defaulting synoptic vector to Manchester Town Hall flagpole.',
    };
  }

  if ([9, 10, 13, 14].includes(code)) {
    const icon = isNightInManchester(point.time) ? 'rain-showers-night' : 'rain-showers-day';
    return { icon, ...dispatchCopy[icon] };
  }

  if (code >= 16 && code <= 18 && point.temperatureC !== null && point.temperatureC <= 0) {
    return { icon: 'freezing-rain', ...dispatchCopy['freezing-rain'] };
  }

  if (code === 7) return { icon: 'overcast', ...dispatchCopy.overcast };
  if (code === 8) {
    return {
      icon: 'overcast',
      title: 'Monolithic Lead Vault',
      quip: 'Natural daylight suppressed. All indoor lamps operating at committee spec.',
    };
  }

  if (code === 25 || code === 26) {
    return {
      icon: 'blizzard',
      title: 'Lancashire Whiteout',
      quip: 'Woollen scarf wraps mandatory (min 2 turns). Boots essential.',
    };
  }

  if ([0, 1, 2, 3, 7, 8].includes(code)) {
    if (point.temperatureC !== null && point.temperatureC >= 29) {
      return { icon: 'extreme-heat', ...dispatchCopy['extreme-heat'] };
    }
    if (point.temperatureC !== null && point.temperatureC <= 0) {
      return { icon: 'frost', ...dispatchCopy.frost };
    }
    if (point.windSpeedMph !== null && point.windSpeedMph >= 34) {
      if (point.windSpeedMph >= 50) {
        return {
          icon: 'windy',
          title: 'Severe Gale Force Squall: Code Amber',
          quip: 'Sandwich board airborne projectiles reported along Deansgate. Take cover in Grade II pubs.',
        };
      }
      return { icon: 'windy', ...dispatchCopy.windy };
    }
  }

  if (code === 29) {
    return { icon: 'severe-storm', ...dispatchCopy['severe-storm'] };
  }

  return { icon: point.icon, ...dispatchCopy[point.icon] };
}

function themeFor(icon: WeatherIcon): string {
  if (icon === 'sunny' || icon === 'partly-cloudy-day' || icon === 'extreme-heat') return 'sunny';
  if (icon === 'clear-night' || icon === 'partly-cloudy-night' || icon === 'frost') return 'night';
  if (icon === 'light-rain' || icon === 'heavy-rain' || icon === 'light-drizzle' || icon.startsWith('rain-showers') || icon === 'freezing-rain') return 'rain';
  if (icon === 'snow' || icon === 'sleet' || icon === 'blizzard') return 'snow';
  if (icon === 'thunderstorm' || icon === 'severe-storm' || icon === 'hail' || icon === 'tornado') return 'storm';
  return 'standard';
}

function formatTemperature(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}°C`;
}

function formatWind(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} mph`;
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
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
    stale.value = hourlyResponse.headers.has('Warning') || dailyResponse.headers.has('Warning');
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
  flex-direction: column;
  min-width: 0;
  padding: 20px;
  border: 1px solid #dfdac9;
  border-radius: 16px;
  background: #f7f3e8;
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%), 0 1px 2px rgb(0 0 0 / 2%);
}

.weather-card.theme-sunny {
  border-color: #ebdcb5;
  background: #faf4e3;
}

.weather-card.theme-night {
  border-color: #cfd7de;
  background: #eceff2;
}

.weather-card.theme-rain {
  border-color: #d4deda;
  background: #f2f4f2;
}

.weather-card.theme-storm {
  border-color: #ecc9be;
  background: #faede8;
}

.weather-card.theme-snow {
  border-color: #d5e5f2;
  background: #f2f7fb;
}

.weather-card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgb(12 35 64 / 12%);
  color: #0c2340;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.weather-card-brand {
  display: flex;
  flex: 1 0 max-content;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.weather-card-brand span {
  white-space: nowrap;
}

.weather-header-icon {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.theme-sunny .weather-header-icon {
  color: #c97a14;
}

.weather-card-window {
  flex: 0 0 auto;
  margin-left: auto;
  color: #7a8288;
  font-size: 9px;
  white-space: nowrap;
}

.weather-current,
.weather-card-state {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 0;
}

.weather-icon-tile {
  display: grid;
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 1px solid rgb(12 35 64 / 14%);
  border-radius: 12px;
  background: rgb(255 255 255 / 65%);
  color: #0c2340;
}

.weather-condition-icon {
  width: 32px;
  height: 32px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.weather-condition-icon.is-loading {
  animation: weather-spin 1.4s linear infinite;
}

.weather-current-copy {
  min-width: 0;
  padding-top: 1px;
}

.weather-current-copy h3,
.weather-card-state h3 {
  margin: 0;
  color: #0c2340;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
}

.weather-current-copy h3 span {
  color: #7a8288;
  font-weight: 400;
}

.weather-current-copy p,
.weather-card-state p {
  margin: 4px 0 0;
  color: #47525d;
  font-size: 14px;
  line-height: 1.5;
}

.weather-state-mark {
  color: #0c2340;
  font-size: 26px;
  line-height: 1;
}

.weather-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid rgb(12 35 64 / 12%);
  color: #6c747c;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.weather-rain {
  color: #1c6b44;
  font-weight: 600;
}

.weather-rain.is-warning {
  color: #a63a2a;
}

.theme-sunny .weather-card-header,
.theme-sunny .weather-card-footer {
  border-color: #e2d5bc;
}

.theme-sunny .weather-icon-tile {
  border-color: #e2d5bc;
  background: #fdfcf7;
}

.theme-night .weather-card-header,
.theme-night .weather-card-footer {
  border-color: #cfd7de;
}

.theme-night .weather-icon-tile {
  border-color: #cfd7de;
  background: #fdfdfd;
}

.theme-rain .weather-card-header,
.theme-rain .weather-card-footer {
  border-color: #d4deda;
}

.theme-storm .weather-card-header,
.theme-storm .weather-card-footer {
  border-color: #ecc9be;
}

.theme-snow .weather-card-header,
.theme-snow .weather-card-footer {
  border-color: #d5e5f2;
}

@keyframes weather-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .weather-condition-icon.is-loading {
    animation-duration: 3s;
  }
}
</style>

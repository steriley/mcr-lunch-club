import { ref, computed } from 'vue';

export type GeolocationState = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';

export interface UserPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Long enough for a cold GPS fix outdoors; shorter timeouts flap between fixes. */
export const GEOLOCATION_TIMEOUT_MS = 25_000;

// GeolocationPositionError codes.
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

/**
 * How a geolocation error changes the state. Returns null when the error is
 * transient and a position is already held, so the UI keeps using the last fix.
 */
function resolveGeolocationError(
  code: number,
  hasPosition: boolean,
  message?: string
): { state: GeolocationState; message: string } | null {
  if (code === PERMISSION_DENIED) {
    return { state: 'denied', message: 'Location permission was denied.' };
  }
  if (hasPosition && (code === TIMEOUT || code === POSITION_UNAVAILABLE)) {
    return null;
  }
  if (code === POSITION_UNAVAILABLE) {
    return { state: 'unavailable', message: 'Location information is unavailable.' };
  }
  if (code === TIMEOUT) {
    return { state: 'error', message: 'Location request timed out.' };
  }
  return { state: 'error', message: message || 'An unknown error occurred while retrieving location.' };
}

export function useGeolocation() {
  const state = ref<GeolocationState>('idle');
  const position = ref<UserPosition | null>(null);
  const errorMessage = ref<string | null>(null);
  const isManual = ref<boolean>(false);

  let watchId: number | null = null;

  function start() {
    if (typeof window === 'undefined') return;

    if (!('geolocation' in navigator)) {
      state.value = 'unavailable';
      errorMessage.value = 'Geolocation is not supported by your browser.';
      return;
    }

    // Clear existing watch if any
    stopLiveWatch();

    isManual.value = false;
    state.value = 'requesting';
    errorMessage.value = null;

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          position.value = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          state.value = 'active';
          errorMessage.value = null;
        },
        (err) => {
          const hasLiveFix = state.value === 'active' && position.value !== null;
          const next = resolveGeolocationError(err.code, hasLiveFix, err.message);
          if (!next) return;
          state.value = next.state;
          errorMessage.value = next.message;
        },
        {
          enableHighAccuracy: true,
          timeout: GEOLOCATION_TIMEOUT_MS,
          maximumAge: 0,
        }
      );
    } catch (e: any) {
      state.value = 'error';
      errorMessage.value = e?.message || 'Failed to start geolocation tracking.';
    }
  }

  function stopLiveWatch() {
    if (watchId !== null && typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function stop() {
    stopLiveWatch();
    state.value = 'idle';
    position.value = null;
    isManual.value = false;
    errorMessage.value = null;
  }

  function setManualPosition(coords: { lat: number; lng: number; accuracy?: number }) {
    stopLiveWatch();
    isManual.value = true;
    state.value = 'active';
    position.value = {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy ?? 15, // Default nominal accuracy for manual pin
    };
    errorMessage.value = null;
  }

  function resumeLive() {
    start();
  }

  const isLive = computed(() => state.value === 'active' && !isManual.value);

  return {
    state,
    position,
    errorMessage,
    isManual,
    isLive,
    start,
    stop,
    stopLiveWatch,
    setManualPosition,
    resumeLive,
  };
}

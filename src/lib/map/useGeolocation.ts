import { ref, computed } from 'vue';

export type GeolocationState = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';

export interface UserPosition {
  lat: number;
  lng: number;
  accuracy: number;
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
          switch (err.code) {
            case err.PERMISSION_DENIED:
              state.value = 'denied';
              errorMessage.value = 'Location permission was denied.';
              break;
            case err.POSITION_UNAVAILABLE:
              state.value = 'unavailable';
              errorMessage.value = 'Location information is unavailable.';
              break;
            case err.TIMEOUT:
              state.value = 'error';
              errorMessage.value = 'Location request timed out.';
              break;
            default:
              state.value = 'error';
              errorMessage.value = err.message || 'An unknown error occurred while retrieving location.';
              break;
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
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

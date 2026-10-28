import type { IconName } from '@/lib/icons';
import type { GeolocationState } from '@/lib/map/useGeolocation';

export interface StatusBanner {
  type: 'info' | 'warning' | 'error' | 'manual';
  icon: IconName;
  text: string;
  action: { label: string; handler: () => void } | null;
}

export interface StatusBannerState {
  /** Dev-only `?near_me_state=` override, null otherwise. */
  devForced: string | null;
  picking: boolean;
  geoState: GeolocationState;
  /** The live fix is too far from Spinningfields to be useful. */
  farFromManchester: boolean;
  /** The position was set by hand. */
  manual: boolean;
  lowAccuracy: boolean;
}

export interface StatusBannerActions {
  startPicking: () => void;
  stopPicking: () => void;
  close: () => void;
  resumeLive: () => void;
}

/**
 * The one notification Near Me shows, if any. Priority: picking a position >
 * acquiring > location errors > far from Manchester > manual position > low
 * accuracy.
 */
export function nearMeStatusBanner(
  state: StatusBannerState,
  actions: StatusBannerActions
): StatusBanner | null {
  const forced = devForcedBanner(state.devForced, actions);
  if (forced) return forced;

  if (state.picking) {
    return {
      type: 'warning',
      icon: 'target',
      text: 'Tap the map to set your position',
      action: { label: 'Cancel', handler: actions.stopPicking },
    };
  }

  if (state.geoState === 'requesting') {
    return { type: 'info', icon: 'signal', text: 'Acquiring your position…', action: null };
  }

  const setLocation = { label: 'Set location', handler: actions.startPicking };
  if (state.geoState === 'denied') {
    return {
      type: 'error',
      icon: 'warning',
      text: 'Location off · showing from Spinningfields',
      action: setLocation,
    };
  }
  if (state.geoState === 'unavailable') {
    return {
      type: 'error',
      icon: 'warning',
      text: 'Location unavailable · showing from Spinningfields',
      action: setLocation,
    };
  }
  if (state.geoState === 'error') {
    return {
      type: 'error',
      icon: 'warning',
      text: 'Location error · showing from Spinningfields',
      action: setLocation,
    };
  }

  // Only a live fix can be "far away": a hand-placed position is wherever the user put it.
  if (state.farFromManchester && state.geoState === 'active' && !state.manual) {
    return {
      type: 'warning',
      icon: 'map',
      text: 'Outside Manchester · showing Spinningfields',
      action: { label: 'Back to the map', handler: actions.close },
    };
  }

  if (state.manual) {
    return {
      type: 'manual',
      icon: 'pin',
      text: 'Position set manually',
      action: { label: 'Resume GPS', handler: actions.resumeLive },
    };
  }

  if (state.lowAccuracy && state.geoState === 'active') {
    return {
      type: 'info',
      icon: 'signal',
      text: 'Location approximate · results may vary',
      action: null,
    };
  }

  return null;
}

function devForcedBanner(forced: string | null, actions: StatusBannerActions): StatusBanner | null {
  switch (forced) {
    case 'denied':
      return {
        type: 'error',
        icon: 'warning',
        text: '[DEV] Location access withheld. The Quorum cannot pinpoint you.',
        action: { label: 'Set Location Manually', handler: actions.startPicking },
      };
    case 'far':
      return {
        type: 'warning',
        icon: 'map',
        text: '[DEV] You appear to be outside Manchester. Spinningfields framing maintained.',
        action: { label: 'Back to the map', handler: actions.close },
      };
    case 'low-accuracy':
      return {
        type: 'info',
        icon: 'signal',
        text: '[DEV] Location approximate — accuracy radius exceeds 100 m.',
        action: null,
      };
    case 'pre-permission':
      return {
        type: 'info',
        icon: 'pin',
        text: '[DEV] Pre-permission state active.',
        action: null,
      };
    default:
      return null;
  }
}

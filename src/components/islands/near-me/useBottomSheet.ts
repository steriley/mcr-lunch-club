import { computed, ref } from 'vue';
import {
  DESKTOP_MIN_WIDTH,
  collapsedSnap,
  cycledSnap,
  expandedSnap,
  sheetHeightCss,
  sheetHeightPx,
  snapAfterSwipe,
  type SheetSnap,
} from '@/lib/near-me/sheet';

/** The venue panel's layout: a floating panel on desktop, a four-height bottom sheet on a phone. */
export function useBottomSheet() {
  const isDesktop = ref(false);
  // Opens at the peek: the handle, the tier chips and the nearest card, leaving most of the screen to the map.
  const snap = ref<SheetSnap>('peek');
  // What the peek's content measures, so the peek is never shorter than it (set by the panel).
  const peekContentPx = ref(0);
  const isCollapsedMobile = computed(() => !isDesktop.value && snap.value === 'collapsed');
  const heightCss = computed(() =>
    sheetHeightCss(snap.value, isDesktop.value, peekContentPx.value)
  );

  function checkScreenSize() {
    if (typeof window !== 'undefined') isDesktop.value = window.innerWidth >= DESKTOP_MIN_WIDTH;
  }

  /** Settled height in px for `state` (default: the current one). */
  function settledHeightPx(state: SheetSnap = snap.value): number {
    return sheetHeightPx(state, window.innerHeight, peekContentPx.value);
  }

  const expand = () => {
    snap.value = expandedSnap(snap.value);
  };
  const collapse = () => {
    snap.value = collapsedSnap(snap.value);
  };
  const cycle = () => {
    snap.value = cycledSnap(snap.value);
  };

  // Swipes on the handle row.
  let touchStartY = 0;
  let touchDeltaY = 0;

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length > 0) {
      touchStartY = event.touches[0].clientY;
      touchDeltaY = 0;
    }
  }

  function onTouchMove(event: TouchEvent) {
    if (event.touches.length > 0) touchDeltaY = event.touches[0].clientY - touchStartY;
  }

  function onTouchEnd() {
    snap.value = snapAfterSwipe(snap.value, touchDeltaY);
    touchStartY = 0;
    touchDeltaY = 0;
  }

  return {
    isDesktop,
    snap,
    peekContentPx,
    isCollapsedMobile,
    heightCss,
    checkScreenSize,
    settledHeightPx,
    expand,
    collapse,
    cycle,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

export type BottomSheet = ReturnType<typeof useBottomSheet>;

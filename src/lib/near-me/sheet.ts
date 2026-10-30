/** Heights of the phone's bottom sheet. On desktop the panel floats beside the map instead. */
export type SheetSnap = 'collapsed' | 'peek' | 'half' | 'full';

/** The snaps from shortest to tallest: a step or a tap on the handle moves along this order. */
const SNAP_ORDER: readonly SheetSnap[] = ['collapsed', 'peek', 'half', 'full'];

/** Below this width the venue panel is a bottom sheet. */
export const DESKTOP_MIN_WIDTH = 1024;

/** How far a swipe on the handle must travel to change the sheet's height. */
const SHEET_SWIPE_PX = 35;

const COLLAPSED_PX = 140;
// Shares of the viewport; sheetHeightCss spells the same heights as 38dvh, 54dvh and 86dvh.
const PEEK_SHARE = 0.38;
const HALF_SHARE = 0.54;
const FULL_SHARE = 0.86;

/** One step taller; full stays full. */
export function expandedSnap(snap: SheetSnap): SheetSnap {
  return SNAP_ORDER[Math.min(SNAP_ORDER.indexOf(snap) + 1, SNAP_ORDER.length - 1)];
}

/** One step shorter; collapsed stays collapsed. */
export function collapsedSnap(snap: SheetSnap): SheetSnap {
  return SNAP_ORDER[Math.max(SNAP_ORDER.indexOf(snap) - 1, 0)];
}

/** The handle is the only non-drag control, so tapping it must reach every height. */
export function cycledSnap(snap: SheetSnap): SheetSnap {
  return SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length];
}

/**
 * The sheet's settled height (its CSS height transitions, so measuring mid-animation would mislead).
 * The peek height is about 38% of the viewport, but never less than the `peekContentPx` its content
 * (handle, tier chips and the nearest card) measures.
 */
export function sheetHeightPx(snap: SheetSnap, viewportHeight: number, peekContentPx = 0): number {
  if (snap === 'collapsed') return COLLAPSED_PX;
  if (snap === 'peek') return Math.max(viewportHeight * PEEK_SHARE, peekContentPx);
  return viewportHeight * (snap === 'half' ? HALF_SHARE : FULL_SHARE);
}

/** The sheet height as CSS, for the `--sheet-current-height` variable; 0 on desktop. */
export function sheetHeightCss(snap: SheetSnap, isDesktop: boolean, peekContentPx = 0): string {
  if (isDesktop) return '0px';
  if (snap === 'collapsed') return `${COLLAPSED_PX}px`;
  if (snap === 'peek') return `max(38dvh, ${Math.ceil(peekContentPx)}px)`;
  return snap === 'half' ? '54dvh' : '86dvh';
}

/** The new height after a swipe of `deltaY` px on the handle (negative is up). */
export function snapAfterSwipe(snap: SheetSnap, deltaY: number): SheetSnap {
  if (deltaY < -SHEET_SWIPE_PX) return expandedSnap(snap);
  if (deltaY > SHEET_SWIPE_PX) return collapsedSnap(snap);
  return snap;
}

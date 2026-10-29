/** Heights of the phone's bottom sheet. On desktop the panel floats beside the map instead. */
export type SheetSnap = 'collapsed' | 'half' | 'full';

/** Below this width the venue panel is a bottom sheet. */
export const DESKTOP_MIN_WIDTH = 1024;

/** How far a swipe on the handle must travel to change the sheet's height. */
const SHEET_SWIPE_PX = 35;

const COLLAPSED_PX = 140;
// Shares of the viewport; sheetHeightCss spells the same heights as 54dvh and 86dvh.
const HALF_SHARE = 0.54;
const FULL_SHARE = 0.86;

/** One step taller; full stays full. */
export function expandedSnap(snap: SheetSnap): SheetSnap {
  return snap === 'collapsed' ? 'half' : 'full';
}

/** One step shorter; collapsed stays collapsed. */
export function collapsedSnap(snap: SheetSnap): SheetSnap {
  return snap === 'full' ? 'half' : 'collapsed';
}

/** The handle is the only non-drag control, so tapping it must reach every height. */
export function cycledSnap(snap: SheetSnap): SheetSnap {
  return snap === 'collapsed' ? 'half' : snap === 'half' ? 'full' : 'collapsed';
}

/** The sheet's settled height (its CSS height transitions, so measuring mid-animation would mislead). */
export function sheetHeightPx(snap: SheetSnap, viewportHeight: number): number {
  if (snap === 'collapsed') return COLLAPSED_PX;
  return viewportHeight * (snap === 'half' ? HALF_SHARE : FULL_SHARE);
}

/** The sheet height as CSS, for the `--sheet-current-height` variable; 0 on desktop. */
export function sheetHeightCss(snap: SheetSnap, isDesktop: boolean): string {
  if (isDesktop) return '0px';
  if (snap === 'collapsed') return `${COLLAPSED_PX}px`;
  return snap === 'half' ? '54dvh' : '86dvh';
}

/** The new height after a swipe of `deltaY` px on the handle (negative is up). */
export function snapAfterSwipe(snap: SheetSnap, deltaY: number): SheetSnap {
  if (deltaY < -SHEET_SWIPE_PX) return expandedSnap(snap);
  if (deltaY > SHEET_SWIPE_PX) return collapsedSnap(snap);
  return snap;
}

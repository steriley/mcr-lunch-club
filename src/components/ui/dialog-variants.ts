/**
 * Visual variants shared by AppDialog and AppAlertDialog. Reka UI supplies the behaviour (focus
 * trap, Escape, scroll lock, aria-hidden on the page behind, focus restore); these classes are
 * the only styling, taken from the theme tokens in src/styles/theme.css and the dossier classes.
 *
 *  - plain:   the Chairs' Area's parchment card.
 *  - dossier: the dossier skin (`.dossier` supplies its variables to the portalled content).
 *  - bare:    layout only (centred, capped to the viewport); the caller brings the surface and
 *             stacking order through `contentClass` / `overlayClass`.
 */
export type DialogVariant = 'plain' | 'dossier' | 'bare';

const LAYOUT =
  'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md';

export const OVERLAY_CLASS: Record<DialogVariant, string> = {
  plain: 'fixed inset-0 z-50 bg-charcoal-fixed/40',
  dossier: 'fixed inset-0 z-50 bg-ink-fixed/45',
  bare: 'fixed inset-0',
};

export const CONTENT_CLASS: Record<DialogVariant, string> = {
  plain: `${LAYOUT} z-50 rounded-2xl border border-hairline bg-parchment shadow-xl`,
  dossier: `dossier ${LAYOUT} z-50 rounded-2xl border-2 border-[var(--dossier-danger)]/50 bg-[var(--dossier-canvas)] shadow-xl`,
  bare: LAYOUT,
};

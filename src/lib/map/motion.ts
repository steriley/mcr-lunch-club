/** True when the visitor has asked their system for less motion. Read live, so a change applies to the next move. */
export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

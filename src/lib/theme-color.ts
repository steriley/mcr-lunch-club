/**
 * A colour token's current value, for the few places CSS variables can't
 * reach: Leaflet writes path colours as SVG attributes, which take a colour
 * but not `var()`. Outside a browser (tests, the server) it returns the
 * `var()` reference, which is what inline styles want anyway.
 */
export function themeColor(token: string): string {
  const reference = `var(--color-${token})`;
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return reference;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim() ||
    reference
  );
}

/** Leaflet ends an animated zoom 250 ms after it starts; this leaves it room. */
const ZOOM_SETTLE_MS = 500;

/**
 * Returns a function that removes `map` safely. Leaflet's `remove()` cancels pan
 * and fly animations but not a zoom already under way: that zoom's end-of-animation
 * timer then moves panes that no longer exist and throws ("reading '_leaflet_pos'"),
 * e.g. when Near Me is closed while it frames the first position fix. So while a
 * zoom is animating, removal waits for its `zoomend` (or a short timeout).
 */
export function createMapRemover(map: any): () => void {
  let zooming = false;
  map.on('zoomanim', () => { zooming = true; });
  map.on('zoomend', () => { zooming = false; });

  return () => {
    map.stop();
    if (!zooming) {
      map.remove();
      return;
    }
    let removed = false;
    const finish = () => {
      if (removed) return;
      removed = true;
      map.remove();
    };
    map.once('zoomend', finish);
    setTimeout(finish, ZOOM_SETTLE_MS);
  };
}

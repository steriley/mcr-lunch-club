/** Pointer travel in px before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 5;

/**
 * Lets a mouse scroll a hidden-scrollbar strip sideways: the wheel scrolls it while it has
 * room to move, and a press-and-drag pans it. Touch and trackpads already scroll natively.
 */
export function enableHorizontalScroll(el: HTMLElement): void {
  el.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || el.scrollWidth <= el.clientWidth)
        return;
      const before = el.scrollLeft;
      el.scrollLeft += event.deltaY;
      // Only swallow the wheel while the strip moved, so the page still scrolls once it hits an end.
      if (el.scrollLeft !== before) event.preventDefault();
    },
    { passive: false }
  );

  let startX = 0;
  let startScroll = 0;
  let pressed = false;
  let dragged = false;

  el.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || el.scrollWidth <= el.clientWidth)
      return;
    pressed = true;
    dragged = false;
    startX = event.clientX;
    startScroll = el.scrollLeft;
  });

  el.addEventListener('pointermove', (event) => {
    if (!pressed) return;
    const travel = event.clientX - startX;
    if (!dragged && Math.abs(travel) < DRAG_THRESHOLD) return;
    if (!dragged) {
      dragged = true;
      el.setPointerCapture(event.pointerId);
      el.classList.add('is-dragging');
    }
    el.scrollLeft = startScroll - travel;
  });

  const release = () => {
    pressed = false;
    el.classList.remove('is-dragging');
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  // A drag ends over a chip; don't let it follow that chip's link.
  el.addEventListener(
    'click',
    (event) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );
  el.addEventListener('dragstart', (event) => event.preventDefault());
}

# Near Me: Build Spec

A phased spec for adding a fullscreen Near Me locate mode to the MCR Lunch Club site. Work one phase at a time: stop at the end of each phase, summarise what changed, and wait for confirmation before starting the next.

## Context

- Stack: Astro with Vue islands, Leaflet, pnpm. Hosted on Vercel. Venue data comes from the existing data layer (Neon + Drizzle, per ADMIN_BUILD_SPEC.md).
- The **Ledger View** is the site's existing map: embedded in the page, showing all inspection sites, centred on the Spinningfields base. It is the standard design and **must not change in behaviour or appearance** except for one addition: a "Near Me" entry button.
- **Near Me** is a new, separate, fullscreen, immersive map experience launched from that button. It runs on mobile and desktop.
- Purpose: foot soldiers out in town open Near Me and see the nearest approved lunch spots to where they are standing.

## Ground rules

1. Before writing code, read the existing Ledger map component and the venue data layer. Do not guess at file paths, field names or tier values. Where this spec uses a placeholder, find the real name in the codebase.
2. Do not modify Ledger View behaviour. Refactors that extract shared code are allowed only if the Ledger map renders and behaves identically afterwards.
3. Near Me is a **separate component** (`NearMeMap`), sharing data, tier definitions, marker styling and tile config with the Ledger map through a shared module.
4. No new runtime dependencies without asking first. Leaflet, Vue and what is already installed should be enough. Dev dependencies for testing are fine if a test runner is not already present.
5. All styling uses CSS variables and existing design tokens, so a visual design pass can be applied later (Phase 6) without restructuring.
6. Client-side only for distance and ranking. No new API routes or database changes unless a phase says otherwise.
7. TypeScript throughout, matching the repo's existing conventions and lint rules.
8. If something in the spec conflicts with what the code actually does, stop and flag it rather than working around it.
9. The Near Me island must be client-only (`client:only="vue"` or equivalent). Leaflet must only be imported or initialised in the browser, inside `onMounted`, because it touches `window` and will crash during Astro's server rendering.

## Data contract

Confirm all of this against the codebase in Phase 0. Each venue needs, at minimum:

- a stable id and name
- latitude and longitude
- a tier (Approved, Under Consideration, To Be Assessed, Rejected, If We Must, Gone But Not Forgotten)
- the verdict text or short note shown in existing popups or venue pages
- a URL or slug for the venue page

Near Me offers **Approved** (on by default), plus Under Consideration, To Be Assessed and If We Must as opt-in filters. **Rejected** and **Gone But Not Forgotten** are never shown in Near Me.

## Phase 0: Recon and shared module (no visible change)

**Goal:** understand the existing map and extract what Near Me will share.

**Tasks**

- Locate the Ledger map component, the venue data source, tier definitions, marker and pin styling, tile layer config and popup content. Report what you find, including file paths, before changing anything.
- Extract into a shared module (suggested: `src/lib/map/`): tile layer config, marker factory (by tier), tier metadata (slug, label, colour, whether Near Me offers it), and the Spinningfields home coordinates and default zoom.
- Update the Ledger map to consume the shared module.

**Acceptance**

- Ledger View looks and behaves exactly as before (visual check plus existing tests and build pass).
- `pnpm build` and lint pass.
- A short written note lists the real field names and tier values found, so later phases use them.

## Phase 1: Fullscreen shell, entry and exit

**Goal:** a "Near Me" button opens an empty-but-correct fullscreen map; closing it returns the user to the Ledger View exactly as they left it.

**Tasks**

- Add a "Near Me" button to the Ledger map (minimal, using existing button styling).
- Create the `NearMeMap` Vue island. Render it with `<Teleport to="body">` so no ancestor `transform` or `overflow` affects `position: fixed`.
- Layout: a shell with `position: fixed; inset: 0; height: 100dvh; isolation: isolate`. A map container fills it. A sibling overlay layer sits above (`z-index` above Leaflet panes) with `pointer-events: none`, and its interactive children set `pointer-events: auto`.
- Use `viewport-fit=cover` and `env(safe-area-inset-*)` for overlay positioning.
- On open: lock body scroll, move focus into the layer (trap focus while open), initialise Leaflet, call `invalidateSize()` after mount, and show all venues of the Near Me tier set at the Spinningfields view.
- On close: destroy the Leaflet instance cleanly (`map.remove()`), release scroll lock, return focus to the Near Me button.
- Close methods: visible close button, Esc key, and browser, Android or iOS back.
- Back handling: push a history entry (or set a `#near-me` hash) on open, and close the layer on `popstate`. Loading the page with `#near-me` should open it directly. Closing via the UI must remove the extra history entry without leaving the user stuck in a back-loop.

**Acceptance**

- Open and close work repeatedly with no console errors and no leaked listeners or map instances.
- Back button closes Near Me and stays on the site.
- Ledger View is unchanged after closing.
- Works at mobile and desktop widths, with no scroll bleed to the page behind.

## Phase 2: Geolocation and user position

**Goal:** show the user on the map, with graceful handling when location is unavailable.

**Tasks**

- Create a composable `useGeolocation` with an explicit state: `idle | requesting | active | denied | unavailable | error`, exposing the latest position (lat, lng, accuracy) and `start()` / `stop()`.
- Request location only when Near Me opens, never on Ledger page load. Use `watchPosition` with `enableHighAccuracy: true`, and always clear the watch on close.
- Render a distinct user marker (`circleMarker`) plus an accuracy `circle`, visually different from venue pins.
- Manual location: tapping or clicking the map while in "set my location" mode places the user marker manually and stops the live watch. Provide a way to return to live location. This is visible on desktop, not only in error states, because desktop location is often inaccurate.
- Controls: "Recentre on me" and "Home" (returns to the Spinningfields view). Auto-follow the user as they move, but stop following as soon as they drag or zoom the map manually. "Recentre on me" resumes following.

**Acceptance**

- Permission granted: marker and accuracy circle appear and update as position changes.
- Permission denied or unsupported: no crash, a clear state is exposed to the UI, and manual location still works.
- The watch is always cleaned up on close and on component unmount.

## Phase 3: Nearest-venue logic

**Goal:** a tested, pure ranking function and the filter state that feeds it.

**Tasks**

- Implement `haversineMetres(a, b)` and `rankVenues({ origin, venues, tiers, limit })` as pure functions in a shared lib file, with unit tests (known distances, sorting, tier filtering, empty results, ties).
- Filter state: Approved on by default; Under Consideration, To Be Assessed and If We Must opt-in; Rejected and Gone But Not Forgotten excluded entirely.
- Recompute the ranking only when the origin has moved by roughly 15 to 20 metres or the filter changes, to prevent list flicker.
- Distances are straight-line. Format as metres under 1 km (rounded sensibly) and kilometres above.
- If no venue matches the filter, still return the single closest venue from the currently selected tiers, flagged as "far away" so the UI can say so.

**Acceptance**

- Unit tests pass.
- Ranking updates correctly when the user moves (simulate with the manual location) and when filters change.

## Phase 4: Venue list, selection and directions

**Goal:** the working interface, with minimal styling, using design tokens.

**Tasks**

- **Mobile (below about 1024px):** bottom sheet with three snap states (collapsed showing the nearest venue only, half, full). Drag handle, with keyboard-accessible alternative controls.
- **Desktop (about 1024px and up):** floating side panel (about 380px) with the same content.
- List rows: venue name, distance, tier badge (text label as well as colour), short verdict line.
- **Nearest-venue hero card** at the top of the list: name, distance, tier badge, verdict, "Walk there" action.
- Tier filter chips floating on the map or at the top of the panel, with "Approved only" as the visible default state.
- Selecting a row (or tapping a pin) highlights the pin, scrolls the row into view, and offers a link to the existing venue page or popup.
- On first fix, `fitBounds` to the user plus the nearest 3 venues, using `paddingBottomRight` and `paddingTopLeft` so the sheet or panel does not cover the results.
- Prevent map gestures leaking through the sheet or panel (`L.DomEvent.disableClickPropagation` and `disableScrollPropagation`).
- "Walk there" opens a directions URL. Default: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=walking`. On Apple devices: `https://maps.apple.com/?daddr={lat},{lng}&dirflg=w`.
- Keep Leaflet attribution visible and offset clear of the sheet or panel.

**Acceptance**

- Full flow works at phone width and desktop width: open, locate, see ranked list, filter, select, get directions, close.
- Nothing important is hidden behind the sheet or panel.
- List reordering as the user moves does not cause jumps while the user is interacting with it.

## Phase 5: States and edge cases

Implement and verify each of these with clear in-tone messages (a formal, slightly mock-official voice in keeping with the site; final copy to be supplied later, placeholder copy for now):

- Pre-permission explanation shown before the browser prompt.
- Permission denied or unavailable: fall back to Spinningfields, offer "set my location".
- Low accuracy (accuracy radius above roughly 100m): show a small "location approximate" note.
- No venues in the selected tiers nearby: say so and show the nearest anyway.
- User far from Manchester: do not zoom out to a useless view; keep Spinningfields framing and offer a way back to Ledger.
- Offline or tile failure: the UI shell still works, with no unhandled errors.

**Acceptance:** each state can be triggered and observed. A dev-only toggle or query param for forcing states is acceptable if removed or gated for production.

## Phase 6: Visual design pass (deferred)

Placeholder phase. Visual designs will be supplied separately once finalised. This phase will apply them: typography, colours, hero card, chips, sheet and panel styling, branded map tiles, and the open and close transition. Until then, Phases 1 to 5 should expose all colours, spacing, radii and shadows as CSS variables, so this phase is a theming exercise and not a rewrite.

## Phase 7: QA and hardening

- Test on real iOS Safari and Android Chrome outdoors, not only by desktop spoofing.
- Accessibility: keyboard operation of every control, visible focus, focus trap and restore, labelled buttons, sufficient contrast, tier indicated by text and not only colour, and `prefers-reduced-motion` respected.
- Performance: no layout thrash on position updates; marker layers updated, not rebuilt, on each fix.
- Confirm Ledger View is regression-free.
- Confirm geolocation watch and Leaflet instance cleanup (open and close 20 times and check for leaks).
- Update project docs with how Near Me works and how to test it.

## Questions to flag instead of guessing

- Where does the venue data's tier field live and what are its exact values?
- Are all venues guaranteed to have coordinates? What happens to ones that do not?
- Is there an existing test runner? If not, propose the smallest option before adding one.
- Are there existing global styles or z-index values that conflict with the overlay layer?

## Definition of done

A user on a phone can open the Ledger map, tap Near Me, grant location, see the nearest Approved venues ranked by distance, add other tiers if they choose, tap through to directions, and close back to an unchanged Ledger View. The same flow works on desktop, including manual location. All Phase 0 to 5 acceptance criteria pass, and Phase 6 can be applied without structural changes.

# NEAR ME: Fixes and Hardening Spec

A follow-up to `NEAR_ME_BUILD_SPEC.md`. It covers corrections and cleanup found when reviewing commit `6b2ff06016421e9d90891e4604b4148835a10062` ("feat: approved near me feature"), which landed roughly Phases 0 to 5 in a single commit. Complete this at a later date, before starting Phase 6 (visual design pass).

Work one item at a time. Make one commit per item. Stop after each item, summarise what changed, and wait for confirmation.

## 1. Review reference

**Reviewed by reading (not run):** `NearMeMap.vue`, `LunchMap.vue`, `VenueSheet.vue`, `src/lib/map/ranking.ts`, `useGeolocation.ts`, `directions.ts`, `tiers.ts`, `markers.ts`, `src/stores/filters.ts`, `src/pages/index.astro`, `package.json`.

**Not reviewed:** `ranking.test.ts`, `directions.test.ts`, `config.ts`, `userMarker.ts`, `index.ts`, `Layout.astro`. Open them during item D1.

**Already correct, do not change:** client-only island (`client:only="vue"`, dynamic Leaflet import), Teleport shell, focus trap and focus restore, history and `#near-me` handling, geolocation watch and map cleanup on close, pure and tested ranking, tier rules (Approved default; Rejected and Gone But Not Forgotten excluded; last chip cannot be deselected), node test runner via `tsx --test` with no new dependencies.

## 2. Ground rules

1. Read the code before editing. Do not guess field names, file paths or tier values.
2. The Ledger View must not change in appearance or behaviour, except where an item explicitly says so (C3 touches shared popup code and must be verified against the Ledger).
3. No new runtime dependencies without asking first.
4. Keep distance and ranking logic client-side and pure where possible, with unit tests for any new logic (`pnpm test`).
5. `pnpm build`, lint and `pnpm test` must pass at the end of every item.
6. If the spec conflicts with what the code does, stop and flag it.

---

## Group A: Correctness (do first)

### A1. Dossier button opens behind Near Me

**Problem:** The map popup's "View Ledger Dossier" button calls `selectVenue()`, which opens `VenueSheet` at `z-[2000]`. The Near Me shell is `z-index: 9999`, so the sheet is invisible until Near Me is closed.

**Tasks:**
- Make `VenueSheet` render above the Near Me shell (the simplest fix is raising its z-index above the shell's).
- Audit anything opened from the sheet (for example `InspectionModal`, `SuggestModal`, `WhereToday`) and give each the correct stacking, so nothing opened while Near Me is active is hidden behind it.
- While the sheet is open, Esc should close the sheet, not Near Me. Focus should move into the sheet and return to the popup trigger or row afterwards.

**Acceptance:**
- In Near Me, tap a pin, tap "View Ledger Dossier": the sheet appears over the map.
- Close the sheet: Near Me is still open and in the same state (position, filters, selected venue).
- Any modal launched from the sheet is also visible.
- Ledger View behaviour is unchanged.

### A2. Walk times are measured from the wrong place

**Problem:** Hero cards and rows show `venue.walkingTimeMin`, which is the walk from the Spinningfields base, next to a distance from the user. "320 m · 12 min walk" reads as 12 minutes from the user.

**Tasks:**
- Add a pure function `estimateWalkMinutes(metres)` (about 80 m/min, minimum 1 minute) next to the ranking code, with unit tests.
- In Near Me hero cards and rows, show the walk time derived from the live distance.
- In Near Me popups, where base-relative figures are shown, label them "from Base".
- Do not change Ledger View labels.

**Acceptance:** Unit tests pass. In Near Me, no walk time is ever presented without making clear what it is measured from.

### A3. Far-from-Manchester ranking contradicts its own label

**Problem:** When the user is more than about 30 km away, the hero says "CLOSEST TO SPINNINGFIELDS" but venues are still ranked from the user's real position, so distances can be hundreds of kilometres.

**Tasks:**
- Extract the 30 km threshold into a named constant in the shared map module.
- Add a pure function (for example `resolveRankingOrigin({ position, isManual })`) that returns `BASE_COORDINATES` when the user is beyond the threshold, and the user's position otherwise. Unit test it.
- Use it for ranking. Distances shown in that state should be from the Spinningfields base and should say so.
- Extend the dev-only forced state (`?near_me_state=far`) so it also forces a far position, so the flow can be tested without leaving Manchester.

**Acceptance:** Forcing the far state shows venues ranked and distanced from Spinningfields, with copy that matches. Returning inside the threshold restores normal ranking from the user's position.

### A4. Transient GPS errors flip the UI into an error state

**Problem:** `useGeolocation` sets `state = 'error'` on any `TIMEOUT` and `unavailable` on `POSITION_UNAVAILABLE`, even when a good position is already held. The banner then says "Defaulting to Spinningfields Base" while ranking quietly keeps using the last fix. Outdoors, with a 10 s timeout, this will flap.

**Tasks:**
- Increase the timeout (suggest 20 to 30 s, as a named constant).
- Keep `state = 'active'` on `TIMEOUT` and `POSITION_UNAVAILABLE` when a position is already held. Track the last transient error separately (for example `lastError`) without changing state.
- If no position is held yet, surface those errors as now.
- `PERMISSION_DENIED` always surfaces immediately.
- Add unit tests for the state transitions if the composable can be tested without a DOM, or extract the transition logic into a pure function to make that possible.

**Acceptance:** A simulated timeout after a successful fix does not show the error banner or the fallback message. A timeout before any fix, and a permission denial, still do.

---

## Group B: UX and spec compliance

### B1. Pre-permission explanation should be a real gate

**Problem:** The pre-permission message shows for 1.2 seconds and then auto-triggers the browser prompt. It cannot be read, and the user has no choice.

**Tasks:**
- Replace the timed auto-dismiss with a panel containing two buttons: a primary "Share my location" (which calls `geo.start()`) and a secondary "Set it manually" (which enters pick-location mode).
- The map and venue list remain usable behind it, ranked from Spinningfields until a choice is made.
- Keep the existing in-tone copy as placeholder text; final copy will be supplied separately.

**Acceptance:** The browser permission prompt appears only after tapping "Share my location". The manual path works without ever requesting location. The panel is keyboard accessible and focus-managed.

### B2. Follow-me recentres on GPS noise

**Problem:** The map calls `setView` on every position update, including one-metre jitter.

**Tasks:** Only recentre while following when the user has moved at least about 10 to 15 metres since the last recentre, reusing `hasOriginMovedSignificantly`. Replace the timeout-based `isProgrammaticMove` flag with a `moveend`-based approach, or otherwise ensure overlapping timers cannot clear it early.

**Acceptance:** A stationary user with small position wobble does not cause repeated animated recentring. Dragging the map still stops following, and "Recentre on me" resumes it.

### B3. Accessibility fixes

**Tasks:**
- The hero card must not be `role="button"` while containing links. Make the card a container with a single clear primary action, or make only the title the activator.
- Row and hero Enter/Space handlers should only fire when the row itself is focused (`@keydown.self`), so pressing Enter on an inner "Walk" or "Dossier" link does not also select the row.
- Use proper list semantics for the venue list (`ul`/`li`, or consistent roles) instead of `role="list"` on a div containing `article role="listitem"`.
- Fix the tier pill contrast: white text on the Under Consideration amber (`#C27803`) is about 3.5:1 at small sizes. Use dark text on that pill or a darker background for the pill only. Do not change map pin colours, which are shared with the Ledger.
- Respect `prefers-reduced-motion` for the sheet transition, map animation and control transitions.

**Acceptance:** Keyboard-only use works end to end. No nested interactive elements. All tier pills meet 4.5:1 text contrast. Reduced-motion users see no animated transitions.

### B4. Layout polish

**Tasks:** Replace `width: 100vw` on the shell with `width: 100%` (the `inset: 0` already sizes it), so hiding the body scrollbar does not shift the desktop layout.

**Acceptance:** No visible layout shift on desktop when Near Me opens or closes.

---

## Group C: Structure and hygiene (before Phase 6)

### C1. Split `NearMeMap.vue`

**Problem:** The component is roughly 2,200 lines combining template, logic and CSS. Visual design work will churn it heavily.

**Tasks:** Split with no behaviour change. Suggested pieces: a status banner component, pre-permission panel, hero card, venue row, tier chips, bottom sheet / side panel shell, and composables for history/hash handling, sheet snapping and map layers. Keep the shell as the orchestrator.

**Acceptance:** Behaviour is identical. Build, lint and tests pass. No single file above roughly 400 lines.

### C2. Tokenise styling

**Problem:** Spec rule 5 required colours, spacing, radii and shadows as CSS variables. The component has about a dozen variables and hundreds of hard-coded hex and rgba values.

**Tasks:**
- Move every colour, radius, shadow and key spacing value into CSS variables defined on the shell.
- Component styles should reference tokens only. Hard-coded values may appear only where the tokens are defined.
- Use `NEAR_ME_DEFAULT_TIERS` instead of hard-coded `['Approved']`, and the named movement-threshold constant instead of the hard-coded `18`.

**Acceptance:** Changing token values in one place restyles the whole Near Me experience. No visual change at the current values.

### C3. Escape popup HTML and tidy the Ledger button

**Tasks:**
- `createVenuePopupContent` builds HTML from venue fields via `innerHTML`. Venues are now editable through the admin area, so build the content with DOM APIs and `textContent`, or escape every interpolated field. Add a unit test with hostile input. This code is shared with the Ledger, so verify the Ledger popup looks identical.
- Remove the stray `title='Return to Spinningfields Base'` text inside the class string on the Ledger recentre button in `LunchMap.vue` (cosmetic, but sloppy).

**Acceptance:** A venue name containing markup renders as text, in both the Ledger and Near Me. Ledger popup appearance is unchanged.

---

## Group D: Re-verification

### D1. Check Phases 1 to 4 against their original acceptance criteria

These were never individually verified, because the build ran past its stop points. Review the files listed as not reviewed in section 1, then test by hand on a real iPhone (Safari) and Android (Chrome), outdoors where possible, plus desktop Chrome and Safari:

- Open and close Near Me 20 times: no console errors, no leaked map instances or geolocation watches.
- Back button, swipe-back and Esc close it correctly; loading `/#near-me` opens it; closing after a direct load leaves no stuck hash.
- Permission granted, denied, and unsupported.
- Manual location: set, then resume GPS.
- Filters: Approved only by default; opt-in tiers appear; the last chip cannot be turned off.
- Bottom sheet (mobile) and side panel (desktop): nothing important hidden behind them, including attribution.
- "Walk there" opens the right directions app on iOS and Android.
- Ledger View is unchanged after closing Near Me.

**Acceptance:** A short written checklist with each line marked pass or fail and any failures logged as new items.

---

## 3. Out of scope for this spec

Phase 6 (visual design pass, Stitch outputs) and Phase 7 (QA and hardening) from `NEAR_ME_BUILD_SPEC.md` remain as written. Do not start them until Groups A to C are complete.

## 4. Definition of done

All A, B and C items are merged, each in its own commit, with `pnpm build`, lint and `pnpm test` green. The D1 checklist has been completed on real devices with no failing items. The Ledger View is verified unchanged.

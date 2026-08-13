# SSG Platform Redesign Plan

**Goal:** Replace CompanyCam-style note-parsed naming with a structural Window → Photo model, fix pin numbering, stabilize the app, and polish UX for field estimators working on-site at churches.

---

## The core problem

The app currently names photos by **parsing typed shorthand notes** (ported from the CompanyCam workflow). The desired model is **structural**: a Window is a container ("folder"); photos captured into it are lettered automatically in chronological capture order. Photo 6 of Window 1 is **1f, always** — so voice notes referencing "1f" always match the photo, and proposals inherit correct labels.

---

## Phase 1 — Data model: Windows as first-class folders

- New `Window` entity (backend, SQLAlchemy): `id, project_id, number (int), name (optional), notes (long text — voice-dictation friendly), created_at, sort_order`.
- `Photo` gains `window_id` (FK, nullable for site/elevation photos), `captured_at` (client-supplied capture timestamp), `capture_sequence` (int), and keeps its own `notes`.
- Auto-lettering rule: photos in a window sorted by `captured_at` (fallback `capture_sequence`, then upload time) → letters `a, b, c … z, aa, ab …`. Letters re-flow on delete/reorder; a `letter_override` column allows manual pinning.
- Alembic-style migration + data backfill: parse existing photos' notes with the current `photo_naming.py` logic to create Windows and assign `window_id`/order.
- New/updated API endpoints:
  - `POST /projects/:id/windows`, `GET /projects/:id/windows`, `PATCH /windows/:id` (incl. notes), `DELETE /windows/:id`
  - `POST /windows/:id/photos` (upload into a window, with `captured_at`)
  - `PATCH /photos/:id` (notes, window reassignment, letter_override)
  - Response schemas include the computed `label` (e.g. `1f`) on every photo.
- Unit tests for lettering (ordering, deletes, >26 photos, overrides, timezone-safe timestamps).

## Phase 2 — Field capture flow (mobile) rebuilt around Windows

- Project screen lists **Window cards** (number, name, photo count, note preview). Big `+ New Window` button auto-increments number (editable).
- **Burst capture mode**: open a window → camera stays live; each shot is instantly badged with its label (`1a, 1b, …`) in a thumbnail strip. No forced review screen between shots. Optional quick-review toggle.
- Persistent banner in camera: `Window 3 · next photo: 3g`.
- **Window-level notes**: one large multiline field per window, mic-dictation friendly (large tap target, keyboard-avoiding, autosave on blur + debounce).
- **Per-photo notes**: tap a lettered thumbnail → photo detail with its own notes field.
- **Offline-first upload queue**: photos + notes persisted locally (expo-file-system + AsyncStorage/SQLite); background sync with per-photo status (queued / uploading / done / failed → tap to retry). Capture timestamps recorded at shutter time so lettering is correct regardless of upload order.

## Phase 3 — Fix pin numbering (annotation "bouncing")

Root cause (dashboard `PhotosTab.tsx`): labels derived from `pins.length + 1` with optimistic updates racing server refreshes; re-fetches reorder pins.
- Server assigns next label atomically per photo (`SELECT max(label)... FOR UPDATE` or per-photo counter).
- Client renders pins keyed by ID at exact click coordinates; never re-derives labels from array position; `sort_order` is authoritative.
- Drag-to-move never renumbers. Larger touch targets, tap-to-edit label, undo-last-pin.

## Phase 4 — Naming & export pipeline

- Rewrite `processing/photo_naming.py` to derive filenames from Window structure: `{window}{letter}.jpg` (`1a.jpg … 1t.jpg, 2a.jpg …`), windows in numeric order, photos chronological within window.
- Site/elevation photos keep directional labels (`North.jpg`, `site_notes.jpg`, etc.).
- Shorthand condition tokens (`w2 l1 b0 rot p 61pc 30x36`) still parsed from notes for the condition sheet — but never drive file naming.
- ZIP download/export uses the new names; report + condition-sheet generators updated to consume Window structure.
- Golden-file tests comparing generated names against expected sets.

## Phase 5 — Proposal generation + customer portal

- Proposal generator consumes Window structure: one section per window, photos in letter order, window notes + per-photo notes feed the narrative, condition data per panel.
- Staff can **edit before send**: narrative, line items, photo selection in dashboard; then publish to portal.
- Portal shows proposal, per-window lettered galleries, accept/decline via existing access-code auth.

## Phase 6 — Stability (crashes / not loading)

- Fix unhandled promise rejections in the mobile upload retry loop (alerts fired after unmount, no queue persistence).
- Memory: thumbnails everywhere in lists, lazy loading, downscale before upload.
- Verify Expo SDK / dependency alignment (`npx expo-doctor`), fix version mismatches.
- API client: timeouts, 401 refresh/re-login flow (no silent white screens), global error boundary with a "your photos are safe" recovery screen.
- Add crash reporting (Sentry) to mobile + dashboard; backend structured logging + health endpoint.

## Phase 7 — UX/UI polish

- One-thumb operation: primary actions bottom-anchored, large hit areas (field use on ladders).
- Haptic + on-screen flash of assigned letter on each capture.
- Dashboard: window-grouped collapsible photo gallery replacing flat grid; project search; recents on home.
- Brand palette (#83A94B family) applied consistently; empty states; skeleton loaders; confirm-destructive-actions.

---

## Execution order

1. Phase 1 (backend model + migration + tests)
2. Phase 4 (naming pipeline + tests)
3. Phase 2 (mobile capture flow)
4. Phase 3 (pin fix)
5. Phase 6 (stability audit)
6. Phase 5 (proposal/portal)
7. Phase 7 (UX polish)

Each phase = its own branch + PR with tests. Do not modify the original Streamlit reference scripts.

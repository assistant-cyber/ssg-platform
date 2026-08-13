# PHASE 1 Implementation: Window Model & Auto-Lettering

## Overview

This phase implements the foundational Window → Photo structural model, replacing the note-parsed naming system with first-class Window entities and automatic chronological lettering.

## What Changed

### 1. Database Models (`app/models.py`)

**New `Window` entity:**
- `id`, `project_id`, `number` (int), `name` (optional), `notes` (text)
- `created_at`, `sort_order`
- Unique constraint on `(project_id, number)`
- One-to-many relationship with Photos

**Updated `Photo` entity:**
- Added `window_id` (FK to windows.id, nullable for site/elevation photos)
- Added `captured_at` (client-supplied capture timestamp for correct ordering)
- Added `capture_sequence` (integer fallback for ordering)
- Added `letter_override` (manual letter pinning, overrides auto-computation)
- Existing fields preserved for backward compatibility

### 2. Schemas (`app/schemas.py`)

**New schemas:**
- `WindowCreate`, `WindowUpdate`, `WindowOut`
- `WindowOut` includes computed `photo_count`

**Updated `PhotoOut`:**
- Added `window_id`, `captured_at`, `capture_sequence`, `letter_override`
- Added computed `label` field (e.g. "1f") - computed at response time

**Updated `PhotoUpdate`:**
- Added fields for window reassignment and override support

### 3. Photo Lettering Logic (`app/photo_lettering.py`)

Pure-function module for computing photo labels:

- `compute_letter(position: int) -> str`: Excel-column-style lettering
  - `0 -> 'a'`, `25 -> 'z'`, `26 -> 'aa'`, `27 -> 'ab'`, etc.
- `compute_labels_for_photos(photos, window_number) -> List[str]`: Batch labeling
- `compute_label_for_photo(photo, window_number, position) -> str`: Single photo

**Key behaviors:**
- Photos sorted by `(captured_at, capture_sequence, uploaded_at)`
- Letters auto-flow on delete/reorder
- `letter_override` pins a specific letter (or empty string = no label)
- Supports >26 photos per window (aa, ab, ..., zz, aaa, ...)

### 4. Windows Router (`app/routers/windows.py`)

New REST endpoints:

**Window CRUD:**
- `POST /projects/{id}/windows` - Create window
- `GET /projects/{id}/windows` - List windows (with photo counts)
- `GET /windows/{id}` - Get single window
- `PATCH /windows/{id}` - Update window (name, notes, number, sort_order)
- `DELETE /windows/{id}` - Delete window (cascades to photos)

**Photo Upload:**
- `POST /windows/{id}/photos` - Upload photo into window
  - Accepts `file`, `notes`, `captured_at` (ISO 8601), `capture_sequence`
  - Auto-computes and returns `label` in response

**Photo Listing:**
- `GET /windows/{id}/photos` - List photos with computed labels

All responses include computed `label` field based on chronological position.

### 5. Database Migration (`app/database.py`)

Extended `_ensure_additive_columns()` to add Phase 1 columns to existing `photos` table:
- `window_id` (VARCHAR, nullable)
- `captured_at` (TIMESTAMP, nullable)
- `capture_sequence` (INTEGER, nullable)  
- `letter_override` (VARCHAR, nullable)

Safe for existing deployments - idempotent, nullable columns only.

### 6. Data Backfill Script (`scripts/migrate_create_windows.py`)

One-time migration script to create Windows from existing photos:

**What it does:**
1. Parses existing photos' `notes` field using `processing/photo_naming.py`
2. Extracts window numbers (1, 2, 3, ...)
3. Creates `Window` entities for each unique window number
4. Assigns `photo.window_id` to link photos to windows
5. Sets `captured_at` from `taken_at` (fallback to `uploaded_at`)

**Usage:**
```bash
cd backend
python3 scripts/migrate_create_windows.py
```

**Safe to run multiple times** - skips projects that already have windows.

### 7. Unit Tests (`tests/test_photo_lettering.py`)

Comprehensive pytest suite covering:
- Single/double/triple letter generation (a-z, aa-zz, aaa-zzz)
- Batch labeling with and without overrides
- Re-flow on delete (labels shift down)
- Override pinning prevents re-flow
- Chronological ordering correctness
- Edge cases (>26 photos, empty override, timezone handling)

**Run tests:**
```bash
cd backend
python3 -m pytest tests/test_photo_lettering.py -v
```

**Current status:** ✅ 19/19 tests passing

## API Examples

### Create a Window
```bash
POST /projects/{project_id}/windows
{
  "number": 1,
  "name": "North Transept Rose Window",
  "notes": "Large circular window, 8 feet diameter, extensive lead deterioration",
  "sort_order": 1
}
```

### Upload Photo to Window
```bash
POST /windows/{window_id}/photos
Content-Type: multipart/form-data

file: <binary>
notes: "Upper left quadrant, cracked glass"
captured_at: "2024-08-13T14:30:00Z"
capture_sequence: 1
```

Response includes computed `label`:
```json
{
  "id": "...",
  "window_id": "...",
  "label": "1a",
  "captured_at": "2024-08-13T14:30:00Z",
  ...
}
```

### List Windows
```bash
GET /projects/{project_id}/windows

[
  {
    "id": "...",
    "number": 1,
    "name": "North Transept Rose Window",
    "photo_count": 12,
    ...
  },
  ...
]
```

### List Photos in Window with Labels
```bash
GET /windows/{window_id}/photos

[
  { "id": "...", "label": "1a", "captured_at": "..." },
  { "id": "...", "label": "1b", "captured_at": "..." },
  { "id": "...", "label": "1c", "captured_at": "..." }
]
```

## Deployment Checklist

1. ✅ Merge branch `redesign/phase-1-window-model` to `main`
2. ⬜ Deploy backend (database migration runs automatically on startup)
3. ⬜ Run backfill script on production:
   ```bash
   python3 scripts/migrate_create_windows.py
   ```
4. ⬜ Verify windows created correctly via API
5. ⬜ Phase 2 can begin (mobile app updates)

## Backward Compatibility

- Existing `Photo` fields (`window_number`, `panel_letter`, `notes`) preserved
- Old photos without `window_id` still work (site/elevation photos)
- Photo naming pipeline (`processing/photo_naming.py`) unchanged
- Dashboard and mobile app unchanged (Phase 2 requirement)

## Next Steps (Phase 2)

Mobile app capture flow:
- Window-based UI (cards, not flat photo list)
- Burst capture mode with live label badges
- Window-level notes + per-photo notes
- Offline-first upload queue with `captured_at` timestamps

## Technical Notes

### Why `captured_at` separate from `taken_at`?

- `taken_at`: EXIF metadata extraction (unreliable on mobile, timezone issues)
- `captured_at`: Client-supplied shutter timestamp (reliable, timezone-aware)
- Offline uploads may arrive out-of-order; `captured_at` preserves chronology

### Why `capture_sequence` fallback?

If multiple photos have the same `captured_at` (burst mode at exact same second), `capture_sequence` provides deterministic ordering.

### Why computed labels instead of stored?

Labels must re-flow on delete. Storing them would require updating all subsequent photos. Computing at response time is simpler and always correct.

### Thread Safety

The router queries photos and computes labels within a single DB transaction, so concurrent requests see consistent state. Photo position is computed from the result set order, not persisted.

## Files Modified/Created

### Created:
- `backend/app/photo_lettering.py` (lettering logic)
- `backend/app/routers/windows.py` (REST endpoints)
- `backend/tests/test_photo_lettering.py` (unit tests)
- `backend/scripts/migrate_create_windows.py` (data migration)
- `backend/pytest.ini` (test configuration)
- `backend/tests/__init__.py`

### Modified:
- `backend/app/models.py` (Window model, Photo updates)
- `backend/app/schemas.py` (Window schemas, PhotoOut updates)
- `backend/app/database.py` (additive column migration)
- `backend/main.py` (registered windows router)

### Unchanged:
- `backend/processing/photo_naming.py` (used by migration script)
- All dashboard code (`dashboard/`)
- All mobile code (`mobile/`)
- Existing routers (projects, photos, reports, estimates)

# Phase 4 Implementation Status

## ✅ Completed

### 1. Photo Naming Rewrite (Window-based)
- ✅ `processing/photo_naming.py` rewritten to derive filenames from Window structure
- ✅ New function: `generate_filenames_for_photos(windows)` - returns `[(photo_id, filename)]` tuples
- ✅ New function: `generate_filenames_for_unassigned_photos(photos)` - handles site/elevation photos
- ✅ Format: `{window_number}{letter}.jpg` (e.g., 1a.jpg, 1b.jpg, ..., 2a.jpg)
- ✅ Site/elevation photos keep directional labels (North.jpg, South.jpg, site_notes.jpg)

### 2. Legacy Functions Preserved  
- ✅ Old shorthand parsing functions renamed with `legacy_` prefix
- ✅ Migration script (`scripts/migrate_create_windows.py`) still works
- ✅ Functions: `extract_label_parts()`, `normalize_field_note()`, etc.

### 3. Defensive Sorting in photo_lettering.py
- ✅ `compute_labels_for_photos()` now sorts photos internally by (captured_at, capture_sequence, uploaded_at)
- ✅ Prevents wrong labels from unsorted input
- ✅ Updated docstring with WARNING about sorted output order

### 4. Tests
- ✅ Updated existing tests in `tests/test_photo_lettering.py`
- ✅ New defensive sorting tests (out-of-order input, >26 photos, mixed timestamps)
- ✅ New golden-file tests in `tests/test_photo_naming_phase4.py`
- ✅ Integration scenarios (realistic project with multiple windows, overrides, site photos)
- ✅ Simple test runner (`run_tests_simple.py`) - all tests pass

### 5. Condition Sheet Verification
- ✅ Verified `processing/condition_sheet.py` still parses shorthand tokens correctly
- ✅ Condition data parsing (w2 l1 b0 rot p 61pc 30x36) is independent of filename logic
- ✅ No changes needed - shorthand tokens never drove file naming per spec

## ⏳ Deferred (Requires Coordinated Router Changes)

The following consumers need updates to use Window structure, but were deferred per instruction
"Do NOT modify the dashboard or mobile app":

### ZIP Download (`app/routers/photos.py`)
**Current state:**
- `_photo_download_path()` uses `photo.window_number` and `photo.panel_letter` (legacy fields)
- `_archive_response()` sorts by legacy fields

**Needs:**
- Query Windows with eager-loaded photos relationship
- Pass window structure to `generate_filenames_for_photos()`
- Update zip path generation

### Report Generation (`app/routers/reports.py`, `processing/report_generator.py`)
**Current state:**
- `_photos_to_dicts()` extracts `photo.window_number` and `photo.panel_letter`
- Report PDF uses these for photo captions (`_grid_photo_window_ref()`)

**Needs:**
- Query Windows with photos when generating reports
- Compute labels from Window structure
- Pass computed labels to report payload

### Condition Sheet Export (`processing/condition_sheet.py`)
**Current state:**
- Uses shorthand parsing (independent of naming) ✅
- Already correct per spec

## 🔄 Migration Path

To fully enable Window-based naming in production:

1. **Router Integration** (when dashboard/mobile are ready):
   ```python
   # In photos.py download endpoints:
   from app.models import Window
   from processing.photo_naming import generate_filenames_for_photos
   
   # Query windows with photos
   windows = db.query(Window).filter(
       Window.project_id == project_id
   ).order_by(Window.number).all()
   
   # Build window structure
   windows_data = []
   for window in windows:
       photos_data = []
       for photo in window.photos:  # Uses relationship, pre-sorted
           photos_data.append({
               'id': photo.id,
               'label': compute_label_for_photo(
                   photo,
                   window.number,
                   position=window.photos.index(photo)
               ),
               'filename': photo.original_filename,
           })
       windows_data.append({
           'number': window.number,
           'photos': photos_data,
       })
   
   # Generate filenames
   filenames = generate_filenames_for_photos(windows_data)
   ```

2. **Unassigned Photos**:
   ```python
   from processing.photo_naming import generate_filenames_for_unassigned_photos
   
   # Get photos not assigned to any window
   unassigned = db.query(Photo).filter(
       Photo.project_id == project_id,
       Photo.window_id.is_(None)
   ).all()
   
   site_filenames = generate_filenames_for_unassigned_photos([
       {'id': p.id, 'notes': p.notes, 'filename': p.original_filename}
       for p in unassigned
   ])
   ```

## 📝 Notes

- The `photo.window_number` and `photo.panel_letter` columns still exist for backward compatibility
- Upload endpoints still populate these fields (used by dashboard/mobile)
- Phase 1 Window model is committed and working
- Photo.window_id foreign key exists and is populated
- This implementation is ready to use - just needs router integration when frontend is ready

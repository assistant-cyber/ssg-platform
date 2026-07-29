"""Photos router — upload, update, retrieve, delete."""
import io
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, UploadFile, status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import ConditionData, Photo, PhotoPin, Project, User, new_uuid
from app.schemas import (
    PhotoDownloadRequest, PhotoOut, PhotoUpdate,
    PhotoPinCreate, PhotoPinOut, PhotoPinUpdate,
)
from app.storage import storage

router = APIRouter(tags=["photos"])


def _parse_condition_from_notes(notes: str, photo_id: str, project_id: str) -> Optional[ConditionData]:
    """Parse shorthand notes into a ConditionData ORM object."""
    if not notes or not notes.strip():
        return None
    try:
        from processing.condition_sheet import parse_shorthand
        pd = parse_shorthand(notes)
        if pd is None:
            return None
        return ConditionData(
            id=new_uuid(),
            photo_id=photo_id,
            project_id=project_id,
            window_num=pd.window_num,
            panel_letter=pd.panel_letter,
            elevation=pd.elevation,
            warping=pd.warping,
            lead_det=pd.lead_det,
            breaks=pd.breaks,
            wood_rot=pd.wood_rot,
            paint_fail=pd.paint_fail,
            pieces=pd.pieces,
            panel_w=pd.panel_w,
            panel_h=pd.panel_h,
            overall_w=pd.overall_w,
            overall_h=pd.overall_h,
            is_overall_only=pd.is_overall_only,
            parsed_notes=pd.notes,
            parsed_at=datetime.utcnow(),
        )
    except Exception:
        return None


def _extract_window_parts(notes: str):
    """Return (window_number, panel_letter, elevation) from shorthand notes."""
    try:
        from processing.photo_naming import extract_label_parts, normalize_field_note
        from processing.condition_sheet import _extract_elevation
        normalized_notes = normalize_field_note(notes)
        win_num, panel_letter = extract_label_parts(normalized_notes)
        elevation = _extract_elevation(normalized_notes)
        return win_num, panel_letter, elevation
    except Exception:
        return None, None, None


def _increment_panel_letter(panel_letter: Optional[str]) -> str:
    """Return the next panel letter in sequence: a->b, ..., z->aa, az->ba, etc.

    A blank/None input (the window's bare first/overall photo) increments to
    "a" - the first lettered panel after it. Mirrors the spreadsheet-column
    style increment used by the dashboard's client-side label predictor
    (dashboard/lib/photoNaming.ts). Existing projects may have older
    uppercase letters (e.g. "1A") stored from before this project switched to
    lowercase - those are lowercased here too so a new photo appended to an
    old window still continues its sequence correctly (as lowercase, going
    forward), instead of only ever comparing exact case.
    """
    letters = (panel_letter or "").strip().lower()
    if not letters or not letters.isalpha():
        return "a"
    chars = list(letters)
    i = len(chars) - 1
    while i >= 0:
        if chars[i] != "z":
            chars[i] = chr(ord(chars[i]) + 1)
            return "".join(chars)
        chars[i] = "a"
        i -= 1
    return "a" + "".join(chars)


def _window_already_has_photos(
    project_id: str,
    db: Session,
    window_number: str,
    exclude_photo_id: Optional[str] = None,
) -> bool:
    """True if this project already has at least one other photo tagged with
    this window number.

    Used to tell a genuinely new window's first/overall shot (bare label,
    e.g. "1", with no panel letter) apart from an explicit re-mention of a
    window that already has photos (e.g. typing "window 1" again after 1a,
    1b already exist) - the latter should continue that window's a/b/c
    sequence rather than resetting it back to a bare label.
    """
    query = db.query(Photo.id).filter(
        Photo.project_id == project_id,
        Photo.window_number == window_number,
    )
    if exclude_photo_id:
        query = query.filter(Photo.id != exclude_photo_id)
    return query.first() is not None


def _next_panel_letter_for_window(
    project_id: str,
    db: Session,
    window_number: str,
    exclude_photo_id: Optional[str] = None,
) -> str:
    """Next panel letter for a SPECIFIC window number, based on the highest
    lettered photo already tagged with it (bare/no-letter counts as the
    position before "a").

    This is deliberately scoped to one window, unlike ``_auto_fill_label``
    (which continues from whatever the most recently uploaded photo in the
    whole project happens to be, assuming photos are shot window-by-window
    in order). It's needed for the case where an existing window is
    explicitly re-mentioned out of that normal order (e.g. typing "window 1"
    again after other windows have already been photographed) - continuing
    from "the last photo in the project" would wrongly pick up whatever
    window was shot most recently instead of window 1's own sequence.
    """
    query = db.query(Photo.panel_letter).filter(
        Photo.project_id == project_id,
        Photo.window_number == window_number,
    )
    if exclude_photo_id:
        query = query.filter(Photo.id != exclude_photo_id)
    letters = [(row[0] or "").strip().lower() for row in query.all()]

    def _rank(letter: str):
        return (0,) if not letter else (1, len(letter), letter)

    best = max(letters, key=_rank, default="")
    return _increment_panel_letter(best)


def _auto_fill_label(
    project_id: str,
    db: Session,
    exclude_photo_id: Optional[str] = None,
    before_sort_order: Optional[int] = None,
):
    """Infer the next (window_number, panel_letter) for a photo with no
    parseable label of its own, by continuing the sequence from the nearest
    labeled photo *before it* in this project (e.g. 1A -> 1B -> 1C -> 1D).

    ``before_sort_order``, when given, restricts the lookup to photos that
    come earlier in the project's sequence than this position - this matters
    when re-inferring a label for a photo that already sits in the middle of
    the sequence (e.g. its notes were edited/blanked), so it inherits from
    its actual predecessor rather than from whatever was uploaded last.
    Newly uploaded photos are always appended at the end, so this can be
    left as None there.

    Returns (None, None) if no prior labeled photo exists to infer from.
    """
    query = db.query(Photo).filter(
        Photo.project_id == project_id,
        Photo.window_number.isnot(None),
    )
    if exclude_photo_id:
        query = query.filter(Photo.id != exclude_photo_id)
    if before_sort_order is not None:
        query = query.filter(Photo.sort_order < before_sort_order)

    last_labeled = query.order_by(
        Photo.sort_order.desc(), Photo.uploaded_at.desc()
    ).first()

    if not last_labeled or not last_labeled.window_number:
        return None, None

    next_letter = _increment_panel_letter(last_labeled.panel_letter)
    return last_labeled.window_number, next_letter


def _make_unique_filename(
    filename: str,
    project_id: str,
    db: Session,
    exclude_photo_id: Optional[str] = None,
) -> str:
    """Append a counter if filename already exists in this project."""
    stem = Path(filename).stem
    ext = Path(filename).suffix
    query = db.query(Photo.filename).filter(Photo.project_id == project_id)
    if exclude_photo_id:
        query = query.filter(Photo.id != exclude_photo_id)
    existing_names = {row[0] for row in query.all()}
    if filename not in existing_names:
        return filename
    counter = 2
    while True:
        candidate = f"{stem}_{counter}{ext}"
        if candidate not in existing_names:
            return candidate
        counter += 1


def _photo_download_path(photo: Photo, used_paths: set[str]) -> str:
    """Path used inside the downloaded zip: one folder per window number.

    Each window gets its own folder named after its number ("1", "2", ...).
    Inside that folder, the window's bare/overall first photo is named after
    the window number itself ("1.jpg"), and every subsequent panel is named
    after just its letter ("a.jpg", "b.jpg", ...) - the folder already
    conveys the window number, so the filename doesn't repeat it. Names are
    always derived strictly from the window number / panel letter label -
    never from the note text or the original camera filename. Letter case is
    used exactly as stored (never re-cased here), so older projects with
    uppercase panel letters (e.g. "1A") still nest correctly as "1/A.jpg"
    alongside newer lowercase ones. Falls back to a flat sequential name only
    when a photo has no window number at all.
    """
    extension = Path(photo.original_filename or photo.storage_url).suffix or ".jpg"

    if photo.window_number:
        folder = photo.window_number
        base_name = (photo.panel_letter or "").strip() or photo.window_number
        candidate_path = f"{folder}/{base_name}{extension}"
    else:
        candidate_path = f"photo_{photo.sort_order + 1:03d}{extension}"

    stem = candidate_path[: -len(extension)] if extension and candidate_path.endswith(extension) else candidate_path
    counter = 2
    final_path = candidate_path
    while final_path in used_paths:
        final_path = f"{stem}_{counter}{extension}"
        counter += 1
    used_paths.add(final_path)
    return final_path


def _photo_bytes(photo: Photo) -> bytes:
    return storage.download_bytes(photo.storage_url)


def _photo_sort_key(photo: Photo):
    """Sort key: window number numerically, then panel letter alphabetically."""
    try:
        win = int(photo.window_number) if photo.window_number else 99999
    except (ValueError, TypeError):
        win = 99999
    panel = (photo.panel_letter or "").lower()
    return (win, panel)


def _archive_response(photos: list[Photo], archive_filename: str, folder_name: str = "") -> StreamingResponse:
    archive_buffer = io.BytesIO()
    used_paths: set[str] = set()

    # Sort photos: window number numerically, then panel letter a->z (bare
    # labels sort first within a window, since "" < any letter).
    sorted_photos = sorted(photos, key=_photo_sort_key)

    prefix = f"{folder_name}/" if folder_name else ""

    with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for photo in sorted_photos:
            path = _photo_download_path(photo, used_paths)
            archive.writestr(f"{prefix}{path}", _photo_bytes(photo))

    archive_buffer.seek(0)
    return StreamingResponse(
        archive_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{archive_filename}"'},
    )


# ─── Upload photo ─────────────────────────────────────────────────────────────

@router.post(
    "/projects/{project_id}/photos",
    response_model=PhotoOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_photo(
    project_id: str,
    file: UploadFile = File(...),
    notes: str = Form(default=""),
    taken_at: Optional[str] = Form(default=None),
    filename_override: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a photo to a project.

    - Generates auto-filename from notes shorthand (photo_naming)
    - Creates thumbnail via storage service
    - Parses shorthand notes into ConditionData
    - Handles duplicate filenames by appending a counter
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Customers can only upload to their linked project
    if current_user.role == "customer" and current_user.linked_project_id != project_id:
        raise HTTPException(status_code=403, detail="Access denied")

    file_bytes = await file.read()
    original_filename = file.filename or "upload.jpg"
    try:
        from processing.photo_naming import normalize_field_note
        normalized_notes = normalize_field_note(notes)
    except Exception:
        normalized_notes = notes.strip() if notes else ""

    # Resolve this photo's window number / panel letter once, up front, so the
    # filename and the stored label fields are always derived from the same
    # source of truth.
    win_num, panel_letter, elevation = _extract_window_parts(notes)
    if not win_num:
        # No parseable label in this photo's own notes (e.g. left blank) -
        # continue the sequence from the last labeled photo in this project
        # (1 -> a -> b -> c ...) instead of leaving it unlabeled.
        auto_win_num, auto_panel_letter = _auto_fill_label(project_id, db)
        if auto_win_num:
            win_num, panel_letter = auto_win_num, auto_panel_letter
    elif not panel_letter:
        # A window number was given but no letter (e.g. "1" or "window 1
        # broken lead"). If this is the first photo taken of this window,
        # leave it bare - that's the window's overall/first shot ("1"). If
        # the window already has photos, treat this as an explicit
        # continuation of that sequence instead of resetting it back to bare.
        if _window_already_has_photos(project_id, db, win_num):
            panel_letter = _next_panel_letter_for_window(project_id, db, win_num)

    requested_filename = Path(filename_override).name.strip() if filename_override else ""

    if requested_filename:
        auto_filename = requested_filename
    else:
        # Auto-generate filename from the resolved label (never from raw
        # notes text - the filename should be exactly "1A.jpg", not
        # "1A-broken-lead.jpg").
        ext = Path(original_filename).suffix or ".jpg"
        if win_num:
            label = f"{win_num}{panel_letter or ''}".strip()
            auto_filename = f"{label}{ext}"
        else:
            auto_filename = original_filename

    # Generate photo_id early so storage layer can use it for key construction
    photo_id = new_uuid()

    auto_filename = _make_unique_filename(auto_filename, project_id, db)

    # Upload only the photo to S3 (no blocking thumbnail generation here)
    photo_url = storage.upload_photo_fast(file_bytes, project_id, auto_filename, photo_id)

    # Async: generate thumbnail in background, don't block the response
    import asyncio
    async def _thumbnail_bg(pid: str, p_url: str, pname: str):
        import time; time.sleep(0.5)  # small delay to let photo upload settle
        try:
            from app.database import SessionLocal
            from app.models import Photo
            db = SessionLocal()
            try:
                photo = db.query(Photo).filter(Photo.id == pid).first()
                if photo and not photo.thumbnail_url:
                    thumb_bytes = storage._make_thumbnail(storage.download_bytes(p_url))
                    thumb_filename = storage._thumbnail_name(pname)
                    thumb_url = storage.upload_file(thumb_bytes, project_id, thumb_filename, subfolder="photos/thumbs", content_type="image/jpeg")
                    photo.thumbnail_url = thumb_url
                    db.commit()
            finally:
                db.close()
        except Exception:
            pass
    asyncio.create_task(_thumbnail_bg(photo_id, photo_url, auto_filename))

    taken_dt: Optional[datetime] = None
    if taken_at:
        try:
            taken_dt = datetime.fromisoformat(taken_at.replace("Z", "+00:00"))
        except ValueError:
            taken_dt = None

    max_sort = (
        db.query(Photo.sort_order)
        .filter(Photo.project_id == project_id)
        .order_by(Photo.sort_order.desc())
        .first()
    )
    sort_order = (max_sort[0] + 1) if max_sort and max_sort[0] is not None else 0

    photo = Photo(
        id=photo_id,
        project_id=project_id,
        storage_url=photo_url,
        thumbnail_url=None,  # will be filled in by background task
        original_filename=original_filename,
        filename=auto_filename,
        window_number=win_num,
        panel_letter=panel_letter,
        elevation=elevation,
        notes=normalized_notes or None,
        taken_at=taken_dt,
        uploaded_by_id=current_user.id,
        sort_order=sort_order,
    )
    db.add(photo)
    db.flush()

    # Parse condition data
    condition = _parse_condition_from_notes(normalized_notes, photo_id, project_id)
    if condition:
        db.add(condition)

    db.commit()
    db.refresh(photo)

    return PhotoOut.model_validate(photo)


@router.post("/projects/{project_id}/photos/download")
def download_project_photos(
    project_id: str,
    body: PhotoDownloadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user.role == "customer" and current_user.linked_project_id != project_id:
        raise HTTPException(status_code=403, detail="Access denied")

    photos = (
        db.query(Photo)
        .filter(Photo.project_id == project_id)
        .order_by(Photo.sort_order, Photo.uploaded_at, Photo.id)
        .all()
    )
    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")

    requested_ids = set(body.photo_ids or [])
    if requested_ids:
        photos = [photo for photo in photos if photo.id in requested_ids]
        if not photos:
            raise HTTPException(status_code=404, detail="Selected photos were not found")

    safe_project_name = "".join(
        char.lower() if char.isalnum() else "-" for char in (project.church_name or project.name or "project")
    ).strip("-") or "project"
    filename = f"{safe_project_name}-photos.zip"

    return _archive_response(photos, filename, folder_name=safe_project_name)


@router.post("/photos/download")
def download_selected_photos(
    body: PhotoDownloadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requested_ids = [photo_id for photo_id in body.photo_ids if isinstance(photo_id, str)]
    if not requested_ids:
        raise HTTPException(status_code=400, detail="No photos selected")

    photos = db.query(Photo).filter(Photo.id.in_(requested_ids)).all()
    photos_by_id = {photo.id: photo for photo in photos}
    ordered_photos = [photos_by_id[photo_id] for photo_id in requested_ids if photo_id in photos_by_id]
    if not ordered_photos:
        raise HTTPException(status_code=404, detail="Selected photos were not found")

    if current_user.role == "customer":
        allowed_project_id = current_user.linked_project_id
        ordered_photos = [photo for photo in ordered_photos if photo.project_id == allowed_project_id]
        if not ordered_photos:
            raise HTTPException(status_code=403, detail="Access denied")

    return _archive_response(ordered_photos, "workspace-photos.zip", folder_name="photos")


# ─── Update photo ─────────────────────────────────────────────────────────────

@router.patch("/photos/{photo_id}", response_model=PhotoOut)
def update_photo(
    photo_id: str,
    body: PhotoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update photo notes and/or sort order.

    If notes changed, re-parses the shorthand and updates ConditionData.
    """
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    if current_user.role == "customer" and current_user.linked_project_id != photo.project_id:
        raise HTTPException(status_code=403, detail="Access denied")

    notes_changed = body.notes is not None and body.notes != photo.notes

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(photo, field, value)

    # Re-parse condition data if notes changed
    if notes_changed:
        try:
            from processing.photo_naming import normalize_field_note
            new_notes = normalize_field_note(body.notes or "")
        except Exception:
            new_notes = body.notes or ""
        photo.notes = new_notes or None
        win_num, panel_letter, elevation = _extract_window_parts(new_notes)
        if not win_num:
            # Notes were cleared or don't contain a parseable label - keep
            # this photo in sequence rather than dropping its label.
            auto_win_num, auto_panel_letter = _auto_fill_label(
                photo.project_id,
                db,
                exclude_photo_id=photo.id,
                before_sort_order=photo.sort_order,
            )
            if auto_win_num:
                win_num, panel_letter = auto_win_num, auto_panel_letter
        elif not panel_letter:
            # Window number given but no letter - bare unless this window
            # already has other photos (see _window_already_has_photos).
            if _window_already_has_photos(photo.project_id, db, win_num, exclude_photo_id=photo.id):
                panel_letter = _next_panel_letter_for_window(
                    photo.project_id, db, win_num, exclude_photo_id=photo.id,
                )
        photo.window_number = win_num
        photo.panel_letter = panel_letter
        photo.elevation = elevation

        # Keep the stored filename (used for downloads) in sync with the
        # resolved label - it should always be exactly "1A.jpg", never the
        # note text.
        if win_num:
            ext = Path(photo.filename or photo.original_filename or "photo.jpg").suffix or ".jpg"
            label = f"{win_num}{panel_letter or ''}".strip()
            candidate_filename = _make_unique_filename(
                f"{label}{ext}", photo.project_id, db, exclude_photo_id=photo.id
            )
            if candidate_filename != photo.filename:
                photo.filename = candidate_filename

        # Delete existing condition data
        existing = (
            db.query(ConditionData).filter(ConditionData.photo_id == photo_id).first()
        )
        if existing:
            db.delete(existing)
            db.flush()

        # Create new condition data
        condition = _parse_condition_from_notes(new_notes, photo_id, photo.project_id)
        if condition:
            db.add(condition)

    db.commit()
    db.refresh(photo)
    return PhotoOut.model_validate(photo)


# ─── Get photo ────────────────────────────────────────────────────────────────

@router.get("/photos/{photo_id}", response_model=PhotoOut)
def get_photo(
    photo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a single photo."""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    if current_user.role == "customer" and current_user.linked_project_id != photo.project_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return PhotoOut.model_validate(photo)


# ─── Delete photo ─────────────────────────────────────────────────────────────

@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    photo_id: str,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Delete a photo (staff only)."""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Cascade deletes ConditionData via ORM relationship
    db.delete(photo)
    db.commit()


# ─── Photo pins (elevation reference photo annotations) ───────────────────────

@router.post("/photos/{photo_id}/pins", response_model=PhotoPinOut, status_code=status.HTTP_201_CREATED)
def create_photo_pin(
    photo_id: str,
    body: PhotoPinCreate,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Place a new numbered pin on an elevation/exterior photo."""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    pin = PhotoPin(
        id=new_uuid(),
        photo_id=photo_id,
        project_id=photo.project_id,
        x_pct=body.x_pct,
        y_pct=body.y_pct,
        label=body.label,
        color=body.color,
        sort_order=body.sort_order,
    )
    db.add(pin)
    db.commit()
    db.refresh(pin)
    return PhotoPinOut.model_validate(pin)


@router.patch("/photo-pins/{pin_id}", response_model=PhotoPinOut)
def update_photo_pin(
    pin_id: str,
    body: PhotoPinUpdate,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Reposition, relabel, recolor, or reorder an existing pin."""
    pin = db.query(PhotoPin).filter(PhotoPin.id == pin_id).first()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pin, field, value)

    db.commit()
    db.refresh(pin)
    return PhotoPinOut.model_validate(pin)


@router.delete("/photo-pins/{pin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo_pin(
    pin_id: str,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Remove a pin."""
    pin = db.query(PhotoPin).filter(PhotoPin.id == pin_id).first()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")
    db.delete(pin)
    db.commit()

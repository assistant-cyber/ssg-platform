"""Progress updates router — staff-posted 'in progress' timeline entries.

A ProgressUpdate is a dated note (with optional photos) that staff post to
narrate ongoing restoration work on a project, visible to the linked customer
in the portal. Distinct from the assessment Photo gallery (window/panel
lettering, AI vision analysis, condition scoring) - these are simple,
customer-facing status posts.
"""
import asyncio
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import ProgressUpdate, ProgressUpdatePhoto, Project, User, new_uuid
from app.schemas import ProgressUpdateOut
from app.storage import storage

router = APIRouter(tags=["progress-updates"])


def _get_project_or_404(project_id: str, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _check_customer_access(project_id: str, current_user: User):
    if current_user.role == "customer" and current_user.linked_project_id != project_id:
        raise HTTPException(status_code=403, detail="Access denied")


# ─── List progress updates ────────────────────────────────────────────────────

@router.get(
    "/projects/{project_id}/progress-updates",
    response_model=List[ProgressUpdateOut],
)
def list_progress_updates(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List progress updates for a project, newest first.

    Both staff and the linked customer may view.
    """
    _get_project_or_404(project_id, db)
    _check_customer_access(project_id, current_user)

    updates = (
        db.query(ProgressUpdate)
        .filter(ProgressUpdate.project_id == project_id)
        .order_by(ProgressUpdate.created_at.desc())
        .all()
    )
    return [ProgressUpdateOut.model_validate(u) for u in updates]


# ─── Create progress update ────────────────────────────────────────────────────

@router.post(
    "/projects/{project_id}/progress-updates",
    response_model=ProgressUpdateOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_progress_update(
    project_id: str,
    note: str = Form(default=""),
    files: List[UploadFile] = File(default=[]),
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Post a new progress update with optional photos (staff only).

    At least one of note / files must be provided - a fully empty update
    isn't useful to show the customer.
    """
    _get_project_or_404(project_id, db)

    note_clean = note.strip() if note else ""
    if not note_clean and not files:
        raise HTTPException(
            status_code=400,
            detail="Provide a note and/or at least one photo for this update.",
        )

    update = ProgressUpdate(
        id=new_uuid(),
        project_id=project_id,
        note=note_clean or None,
        posted_by_id=current_user.id,
    )
    db.add(update)
    db.flush()  # assign update.id before attaching photos

    loop = asyncio.get_event_loop()
    for index, upload in enumerate(files):
        if not upload or not upload.filename:
            continue
        file_bytes = await upload.read()
        if not file_bytes:
            continue

        photo_id = new_uuid()
        ext = (upload.filename.rsplit(".", 1)[-1] if "." in upload.filename else "jpg").lower()
        storage_filename = f"{photo_id}.{ext}"

        # Run blocking S3/local I/O in the thread pool so we don't block the
        # event loop for the duration of the upload (same reasoning as the
        # main photo upload path in photos.py).
        photo_url = await loop.run_in_executor(
            None,
            lambda fb=file_bytes, fn=storage_filename: storage.upload_file(
                fb, project_id, fn, subfolder="progress_updates",
                content_type=storage.guess_content_type(fn),
            ),
        )

        thumbnail_url: Optional[str] = None
        try:
            thumb_bytes = await loop.run_in_executor(None, lambda fb=file_bytes: storage._make_thumbnail(fb))
            thumb_filename = storage._thumbnail_name(storage_filename)
            thumbnail_url = await loop.run_in_executor(
                None,
                lambda tb=thumb_bytes, tfn=thumb_filename: storage.upload_file(
                    tb, project_id, tfn, subfolder="progress_updates/thumbs",
                    content_type="image/jpeg",
                ),
            )
        except Exception:
            thumbnail_url = None  # non-fatal - full image still uploaded

        db.add(ProgressUpdatePhoto(
            id=photo_id,
            progress_update_id=update.id,
            storage_url=photo_url,
            thumbnail_url=thumbnail_url,
            sort_order=index,
        ))

    db.commit()
    db.refresh(update)
    return ProgressUpdateOut.model_validate(update)


# ─── Delete progress update ────────────────────────────────────────────────────

@router.delete(
    "/progress-updates/{update_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_progress_update(
    update_id: str,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Delete a progress update and its photos (staff only)."""
    update = db.query(ProgressUpdate).filter(ProgressUpdate.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Progress update not found")

    db.delete(update)  # cascades to ProgressUpdatePhoto rows via ORM relationship
    db.commit()

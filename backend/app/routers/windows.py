"""Windows router — CRUD operations for Window entities."""
from datetime import datetime
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, UploadFile, status,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Photo, Project, User, Window, new_uuid
from app.photo_lettering import compute_labels_for_photos
from app.schemas import PhotoOut, WindowCreate, WindowOut, WindowUpdate
from app.storage import storage

router = APIRouter(tags=["windows"])


def _enrich_photo_with_label(photo: Photo, window_number: int, position: int) -> dict:
    """Convert Photo ORM to dict and add computed label."""
    from app.photo_lettering import compute_label_for_photo
    
    photo_dict = {
        "id": photo.id,
        "project_id": photo.project_id,
        "window_id": photo.window_id,
        "storage_url": photo.storage_url,
        "thumbnail_url": photo.thumbnail_url,
        "original_filename": photo.original_filename,
        "filename": photo.filename,
        "window_number": photo.window_number,
        "panel_letter": photo.panel_letter,
        "elevation": photo.elevation,
        "notes": photo.notes,
        "taken_at": photo.taken_at,
        "captured_at": photo.captured_at,
        "capture_sequence": photo.capture_sequence,
        "letter_override": photo.letter_override,
        "uploaded_at": photo.uploaded_at,
        "uploaded_by_id": photo.uploaded_by_id,
        "sort_order": photo.sort_order,
        "is_elevation": photo.is_elevation,
        "dim_width": photo.dim_width,
        "dim_height": photo.dim_height,
        "dim_depth": photo.dim_depth,
        "condition_data": photo.condition_data,
        "pins": photo.pins,
    }
    
    # Compute label
    label = compute_label_for_photo(
        {"letter_override": photo.letter_override},
        window_number,
        position
    )
    photo_dict["label"] = label
    
    return photo_dict


@router.post("/projects/{project_id}/windows", response_model=WindowOut, status_code=status.HTTP_201_CREATED)
def create_window(
    project_id: str,
    window_data: WindowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Create a new window in a project."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check for duplicate window number
    existing = db.query(Window).filter(
        Window.project_id == project_id,
        Window.number == window_data.number
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Window {window_data.number} already exists in this project"
        )
    
    # Create window
    window = Window(
        id=new_uuid(),
        project_id=project_id,
        number=window_data.number,
        name=window_data.name,
        notes=window_data.notes,
        sort_order=window_data.sort_order,
        created_at=datetime.utcnow(),
    )
    
    db.add(window)
    db.commit()
    db.refresh(window)
    
    # Add photo_count
    result = WindowOut.model_validate(window)
    result.photo_count = 0
    
    return result


@router.get("/projects/{project_id}/windows", response_model=List[WindowOut])
def list_windows(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all windows in a project, ordered by sort_order."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get windows with photo counts
    windows = db.query(
        Window,
        func.count(Photo.id).label("photo_count")
    ).outerjoin(
        Photo, Photo.window_id == Window.id
    ).filter(
        Window.project_id == project_id
    ).group_by(
        Window.id
    ).order_by(
        Window.sort_order, Window.number
    ).all()
    
    result = []
    for window, photo_count in windows:
        window_out = WindowOut.model_validate(window)
        window_out.photo_count = photo_count
        result.append(window_out)
    
    return result


@router.get("/windows/{window_id}", response_model=WindowOut)
def get_window(
    window_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single window by ID."""
    window = db.query(Window).filter(Window.id == window_id).first()
    if not window:
        raise HTTPException(status_code=404, detail="Window not found")
    
    # Get photo count
    photo_count = db.query(func.count(Photo.id)).filter(
        Photo.window_id == window_id
    ).scalar()
    
    result = WindowOut.model_validate(window)
    result.photo_count = photo_count
    
    return result


@router.patch("/windows/{window_id}", response_model=WindowOut)
def update_window(
    window_id: str,
    window_data: WindowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Update a window (name, notes, number, sort_order)."""
    window = db.query(Window).filter(Window.id == window_id).first()
    if not window:
        raise HTTPException(status_code=404, detail="Window not found")
    
    # Check for duplicate number if changing
    if window_data.number is not None and window_data.number != window.number:
        existing = db.query(Window).filter(
            Window.project_id == window.project_id,
            Window.number == window_data.number,
            Window.id != window_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Window {window_data.number} already exists in this project"
            )
    
    # Update fields
    for field, value in window_data.model_dump(exclude_unset=True).items():
        setattr(window, field, value)
    
    db.commit()
    db.refresh(window)
    
    # Get photo count
    photo_count = db.query(func.count(Photo.id)).filter(
        Photo.window_id == window_id
    ).scalar()
    
    result = WindowOut.model_validate(window)
    result.photo_count = photo_count
    
    return result


@router.delete("/windows/{window_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_window(
    window_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Delete a window and all its photos (cascade)."""
    window = db.query(Window).filter(Window.id == window_id).first()
    if not window:
        raise HTTPException(status_code=404, detail="Window not found")
    
    db.delete(window)
    db.commit()
    
    return None


@router.post("/windows/{window_id}/photos", response_model=PhotoOut, status_code=status.HTTP_201_CREATED)
async def upload_photo_to_window(
    window_id: str,
    file: UploadFile = File(...),
    notes: Optional[str] = Form(None),
    captured_at: Optional[str] = Form(None),  # ISO format datetime string
    capture_sequence: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Upload a photo into a window with captured_at timestamp.
    
    The photo is automatically assigned a letter based on its chronological
    position within the window.
    """
    # Verify window exists
    window = db.query(Window).filter(Window.id == window_id).first()
    if not window:
        raise HTTPException(status_code=404, detail="Window not found")
    
    # Parse captured_at if provided
    captured_at_dt = None
    if captured_at:
        try:
            captured_at_dt = datetime.fromisoformat(captured_at.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid captured_at format. Use ISO 8601 format."
            )
    
    # Upload file to storage
    file_content = await file.read()
    storage_url = storage.upload(
        file_content,
        filename=file.filename,
        content_type=file.content_type,
    )
    
    # Generate thumbnail (optional, storage backend dependent)
    thumbnail_url = None
    if hasattr(storage, 'generate_thumbnail'):
        try:
            thumbnail_url = storage.generate_thumbnail(storage_url, max_size=(200, 200))
        except Exception:
            pass  # Thumbnail generation is optional
    
    # Create photo
    photo = Photo(
        id=new_uuid(),
        project_id=window.project_id,
        window_id=window_id,
        storage_url=storage_url,
        thumbnail_url=thumbnail_url,
        original_filename=file.filename,
        notes=notes,
        captured_at=captured_at_dt or datetime.utcnow(),
        capture_sequence=capture_sequence,
        uploaded_at=datetime.utcnow(),
        uploaded_by_id=current_user.id,
        sort_order=0,
    )
    
    db.add(photo)
    db.commit()
    db.refresh(photo)
    
    # Get all photos in this window to compute label
    photos_in_window = db.query(Photo).filter(
        Photo.window_id == window_id
    ).order_by(
        Photo.captured_at,
        Photo.capture_sequence,
        Photo.uploaded_at
    ).all()
    
    # Find position of this photo
    position = next(
        (i for i, p in enumerate(photos_in_window) if p.id == photo.id),
        0
    )
    
    # Enrich with label
    photo_dict = _enrich_photo_with_label(photo, window.number, position)
    
    return PhotoOut.model_validate(photo_dict)


@router.get("/windows/{window_id}/photos", response_model=List[PhotoOut])
def list_window_photos(
    window_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all photos in a window with computed labels."""
    # Verify window exists
    window = db.query(Window).filter(Window.id == window_id).first()
    if not window:
        raise HTTPException(status_code=404, detail="Window not found")
    
    # Get photos sorted by capture time
    photos = db.query(Photo).filter(
        Photo.window_id == window_id
    ).order_by(
        Photo.captured_at,
        Photo.capture_sequence,
        Photo.uploaded_at
    ).all()
    
    # Enrich each photo with its label
    result = []
    for idx, photo in enumerate(photos):
        photo_dict = _enrich_photo_with_label(photo, window.number, idx)
        result.append(PhotoOut.model_validate(photo_dict))
    
    return result

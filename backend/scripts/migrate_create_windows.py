#!/usr/bin/env python3
"""Data backfill migration: Create Windows from existing photos.

This script analyzes existing photos using the photo_naming.py parsing logic
to extract window numbers, then creates Window entities and assigns photos
to them.

Run this ONCE after adding the Window model to backfill existing data.
Safe to run multiple times (idempotent - skips already-migrated projects).
"""
import sys
from pathlib import Path

# Add backend to path so we can import app modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.database import SessionLocal, create_tables
from app.models import Photo, Project, Window, new_uuid
from processing.photo_naming import extract_label_parts


def parse_window_number_from_photo(photo: Photo) -> Optional[int]:
    """Extract window number from photo notes using photo_naming logic.
    
    Returns:
        Integer window number or None if photo is not a window photo
        (e.g. site/elevation photos).
    """
    if not photo.notes:
        return None
    
    window_str, panel_letter = extract_label_parts(photo.notes)
    
    if window_str and window_str.isdigit():
        return int(window_str)
    
    return None


def group_photos_by_window(photos: List[Photo]) -> Dict[int, List[Photo]]:
    """Group photos by their window number.
    
    Returns:
        Dict mapping window_number -> list of photos
    """
    windows = defaultdict(list)
    
    for photo in photos:
        win_num = parse_window_number_from_photo(photo)
        if win_num is not None:
            windows[win_num].append(photo)
    
    return dict(windows)


def create_windows_for_project(db: Session, project: Project) -> int:
    """Create Window entities for a project and assign photos.
    
    Returns:
        Number of windows created
    """
    # Check if project already has windows
    existing_windows = db.query(Window).filter(
        Window.project_id == project.id
    ).count()
    
    if existing_windows > 0:
        print(f"  Project '{project.name}' already has {existing_windows} windows, skipping")
        return 0
    
    # Get all photos for this project
    photos = db.query(Photo).filter(
        Photo.project_id == project.id
    ).order_by(
        Photo.taken_at, Photo.uploaded_at
    ).all()
    
    if not photos:
        print(f"  Project '{project.name}' has no photos, skipping")
        return 0
    
    # Group photos by window number
    windows_dict = group_photos_by_window(photos)
    
    if not windows_dict:
        print(f"  Project '{project.name}' has {len(photos)} photos but none have window numbers")
        return 0
    
    # Create Window entities
    windows_created = 0
    for win_num in sorted(windows_dict.keys()):
        win_photos = windows_dict[win_num]
        
        # Create Window
        window = Window(
            id=new_uuid(),
            project_id=project.id,
            number=win_num,
            name=None,  # No name in old data
            notes=None,  # Notes were per-photo in old model
            created_at=datetime.utcnow(),
            sort_order=win_num,  # Use window number as initial sort order
        )
        
        db.add(window)
        db.flush()  # Get the window ID
        
        # Assign photos to this window
        for photo in win_photos:
            photo.window_id = window.id
            
            # Set captured_at from taken_at if not already set
            if not photo.captured_at and photo.taken_at:
                photo.captured_at = photo.taken_at
            elif not photo.captured_at:
                # Fallback to upload time
                photo.captured_at = photo.uploaded_at
        
        windows_created += 1
        print(f"    Created Window {win_num} with {len(win_photos)} photos")
    
    return windows_created


def main():
    """Run the migration."""
    print("=" * 60)
    print("SSG Data Migration: Create Windows from Photos")
    print("=" * 60)
    print()
    
    # Ensure tables exist
    create_tables()
    
    db = SessionLocal()
    
    try:
        # Get all projects
        projects = db.query(Project).all()
        print(f"Found {len(projects)} projects")
        print()
        
        total_windows = 0
        migrated_projects = 0
        
        for project in projects:
            print(f"Processing project: {project.name} (ID: {project.id})")
            
            windows_created = create_windows_for_project(db, project)
            
            if windows_created > 0:
                migrated_projects += 1
                total_windows += windows_created
            
            print()
        
        # Commit all changes
        db.commit()
        
        print("=" * 60)
        print("Migration complete!")
        print(f"  Projects migrated: {migrated_projects}/{len(projects)}")
        print(f"  Windows created: {total_windows}")
        print("=" * 60)
        
    except Exception as e:
        db.rollback()
        print(f"\nERROR: Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        db.close()


if __name__ == "__main__":
    main()

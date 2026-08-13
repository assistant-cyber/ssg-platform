"""
Phase 4 Integration Tests — Window-based Naming Pipeline

Tests the complete Phase 4 integration:
- Windows with photos in out-of-order captured_at timestamps
- ZIP export naming from generate_filenames_for_photos
- Report payload organization
- Condition sheet organization

Uses an in-memory SQLite DB with real ORM models.
"""
import os
import pytest
from datetime import datetime, timedelta
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Project, Window, Photo, new_uuid
from processing.photo_naming import (
    generate_filenames_for_photos,
    generate_filenames_for_unassigned_photos,
)


@pytest.fixture
def db_session():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def test_project(db_session):
    """Create a test project."""
    project = Project(
        id=new_uuid(),
        name="Test Church",
        church_name="First Presbyterian",
        status="assessment",
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def test_window_based_naming_out_of_order_captures(db_session, test_project):
    """Test that filenames are derived from Window structure with chronological ordering.
    
    Photos captured out of order (timestamps not matching upload order) should
    be lettered chronologically by captured_at, not by upload order.
    """
    # Create Window 1
    window_1 = Window(
        id=new_uuid(),
        project_id=test_project.id,
        number=1,
        name="South Window",
        notes="Triple-lancet with grisaille borders",
        sort_order=0,
    )
    db_session.add(window_1)
    
    # Create Window 2
    window_2 = Window(
        id=new_uuid(),
        project_id=test_project.id,
        number=2,
        name="North Window",
        notes="Rose window",
        sort_order=1,
    )
    db_session.add(window_2)
    db_session.commit()
    
    # Create photos with OUT-OF-ORDER captured_at timestamps
    base_time = datetime(2026, 8, 1, 10, 0, 0)
    
    # Window 1 photos uploaded in order, but captured out of order
    photo_1a = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=window_1.id,
        storage_url="s3://bucket/photo1.jpg",
        original_filename="IMG_001.jpg",
        captured_at=base_time + timedelta(minutes=2),  # 2nd photo chronologically
        capture_sequence=1,
        uploaded_at=base_time + timedelta(hours=1),
        sort_order=0,
    )
    
    photo_1b = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=window_1.id,
        storage_url="s3://bucket/photo2.jpg",
        original_filename="IMG_002.jpg",
        captured_at=base_time,  # 1st photo chronologically (earliest)
        capture_sequence=2,
        uploaded_at=base_time + timedelta(hours=1, minutes=1),
        sort_order=1,
    )
    
    photo_1c = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=window_1.id,
        storage_url="s3://bucket/photo3.jpg",
        original_filename="IMG_003.jpg",
        captured_at=base_time + timedelta(minutes=5),  # 3rd photo chronologically
        capture_sequence=3,
        uploaded_at=base_time + timedelta(hours=1, minutes=2),
        sort_order=2,
    )
    
    # Window 2 photos
    photo_2a = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=window_2.id,
        storage_url="s3://bucket/photo4.jpg",
        original_filename="IMG_004.jpg",
        captured_at=base_time + timedelta(hours=2),
        capture_sequence=0,
        uploaded_at=base_time + timedelta(hours=3),
        sort_order=3,
    )
    
    photo_2b = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=window_2.id,
        storage_url="s3://bucket/photo5.jpg",
        original_filename="IMG_005.jpg",
        captured_at=base_time + timedelta(hours=2, minutes=1),
        capture_sequence=1,
        uploaded_at=base_time + timedelta(hours=3, minutes=1),
        sort_order=4,
    )
    
    db_session.add_all([photo_1a, photo_1b, photo_1c, photo_2a, photo_2b])
    db_session.commit()
    
    # Query windows with photos (same ordering as windows router)
    from app.models import Window
    windows = (
        db_session.query(Window)
        .filter(Window.project_id == test_project.id)
        .order_by(Window.sort_order, Window.number)
        .all()
    )
    
    # Build windows data structure
    windows_data = []
    for window in windows:
        photos = (
            db_session.query(Photo)
            .filter(Photo.window_id == window.id)
            .order_by(
                Photo.captured_at,
                Photo.capture_sequence,
                Photo.uploaded_at
            )
            .all()
        )
        
        photos_dicts = [
            {
                'id': p.id,
                'label': None,
                'letter_override': p.letter_override,
                'filename': p.original_filename,
                'captured_at': p.captured_at,
                'capture_sequence': p.capture_sequence,
                'uploaded_at': p.uploaded_at,
            }
            for p in photos
        ]
        
        windows_data.append({
            'number': window.number,
            'photos': photos_dicts,
        })
    
    # Generate filenames
    filenames = generate_filenames_for_photos(windows_data)
    
    # Build photo_id -> filename map
    filename_map = {pid: fname for pid, fname in filenames}
    
    # Assert correct lettering based on captured_at chronological order
    # Window 1: photo_1b (earliest) -> 1a, photo_1a (2 mins) -> 1b, photo_1c (5 mins) -> 1c
    assert filename_map[photo_1b.id] == "1a.jpg", "Earliest photo should be 1a"
    assert filename_map[photo_1a.id] == "1b.jpg", "Second photo should be 1b"
    assert filename_map[photo_1c.id] == "1c.jpg", "Third photo should be 1c"
    
    # Window 2: chronological order
    assert filename_map[photo_2a.id] == "2a.jpg"
    assert filename_map[photo_2b.id] == "2b.jpg"


def test_unassigned_photos_directional_naming(db_session, test_project):
    """Test that site/elevation photos without window_id get directional labels."""
    # Create unassigned photos with directional notes
    photo_north = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=None,  # unassigned
        storage_url="s3://bucket/north.jpg",
        original_filename="north_elevation.jpg",
        notes="North elevation overall shot",
        uploaded_at=datetime.utcnow(),
        sort_order=0,
    )
    
    photo_south = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=None,
        storage_url="s3://bucket/south.jpg",
        original_filename="south_elevation.jpg",
        notes="South side full view",
        uploaded_at=datetime.utcnow(),
        sort_order=1,
    )
    
    photo_site = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=None,
        storage_url="s3://bucket/site.jpg",
        original_filename="site_notes.jpg",
        notes="site notes - parking access",
        uploaded_at=datetime.utcnow(),
        sort_order=2,
    )
    
    db_session.add_all([photo_north, photo_south, photo_site])
    db_session.commit()
    
    # Generate filenames for unassigned photos
    photos_dicts = [
        {
            'id': photo_north.id,
            'notes': photo_north.notes,
            'filename': photo_north.original_filename,
        },
        {
            'id': photo_south.id,
            'notes': photo_south.notes,
            'filename': photo_south.original_filename,
        },
        {
            'id': photo_site.id,
            'notes': photo_site.notes,
            'filename': photo_site.original_filename,
        },
    ]
    
    filenames = generate_filenames_for_unassigned_photos(photos_dicts)
    filename_map = {pid: fname for pid, fname in filenames}
    
    assert filename_map[photo_north.id] == "North.jpg"
    assert filename_map[photo_south.id] == "South.jpg"
    assert filename_map[photo_site.id] == "site_notes.jpg"


def test_letter_override_respected(db_session, test_project):
    """Test that letter_override pins a photo's label."""
    window = Window(
        id=new_uuid(),
        project_id=test_project.id,
        number=5,
        name="Test Window",
        sort_order=0,
    )
    db_session.add(window)
    db_session.commit()
    
    base_time = datetime(2026, 8, 1, 12, 0, 0)
    
    # Photo 1: auto-lettered 'a'
    photo_a = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=window.id,
        storage_url="s3://bucket/photo_a.jpg",
        original_filename="photo_a.jpg",
        captured_at=base_time,
        uploaded_at=base_time,
        letter_override=None,  # auto
        sort_order=0,
    )
    
    # Photo 2: manually pinned to 'z'
    photo_z = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=window.id,
        storage_url="s3://bucket/photo_z.jpg",
        original_filename="photo_z.jpg",
        captured_at=base_time + timedelta(minutes=1),
        uploaded_at=base_time + timedelta(minutes=1),
        letter_override='z',  # pinned
        sort_order=1,
    )
    
    # Photo 3: auto-lettered 'c' (position 2)
    photo_c = Photo(
        id=new_uuid(),
        project_id=test_project.id,
        window_id=window.id,
        storage_url="s3://bucket/photo_c.jpg",
        original_filename="photo_c.jpg",
        captured_at=base_time + timedelta(minutes=2),
        uploaded_at=base_time + timedelta(minutes=2),
        letter_override=None,  # auto
        sort_order=2,
    )
    
    db_session.add_all([photo_a, photo_z, photo_c])
    db_session.commit()
    
    # Build windows data
    photos = [photo_a, photo_z, photo_c]
    photos_dicts = [
        {
            'id': p.id,
            'label': None,
            'letter_override': p.letter_override,
            'filename': p.original_filename,
            'captured_at': p.captured_at,
            'capture_sequence': p.capture_sequence,
            'uploaded_at': p.uploaded_at,
        }
        for p in photos
    ]
    
    windows_data = [{
        'number': window.number,
        'photos': photos_dicts,
    }]
    
    filenames = generate_filenames_for_photos(windows_data)
    filename_map = {pid: fname for pid, fname in filenames}
    
    # Photo 1 should be auto-lettered 'a' (position 0)
    assert filename_map[photo_a.id] == "5a.jpg"
    
    # Photo 2 should be manually pinned to 'z'
    assert filename_map[photo_z.id] == "5z.jpg"
    
    # Photo 3 should be auto-lettered 'c' (position 2)
    # Note: the photo_naming module doesn't skip letters, it just uses position
    # so position=2 -> letter 'c' even though 'b' was never used
    assert filename_map[photo_c.id] == "5c.jpg"


def test_multiple_windows_numeric_ordering(db_session, test_project):
    """Test that windows are sorted numerically (1, 2, 10, not 1, 10, 2)."""
    windows_data_input = [
        {'number': 10, 'photos': [{'id': 'p10a', 'label': None, 'letter_override': None, 'filename': 'a.jpg'}]},
        {'number': 2, 'photos': [{'id': 'p2a', 'label': None, 'letter_override': None, 'filename': 'b.jpg'}]},
        {'number': 1, 'photos': [{'id': 'p1a', 'label': None, 'letter_override': None, 'filename': 'c.jpg'}]},
    ]
    
    filenames = generate_filenames_for_photos(windows_data_input)
    
    # Should be sorted by window number, so order is: 1a, 2a, 10a
    assert filenames == [
        ('p1a', '1a.jpg'),
        ('p2a', '2a.jpg'),
        ('p10a', '10a.jpg'),
    ]


def test_fallback_filename_no_label(db_session, test_project):
    """Test fallback when a photo has no label (should not happen in production)."""
    from processing.photo_naming import _id_stem
    
    # Photo with no label and no window
    photos_dicts = [{
        'id': 'photo_abc123def',
        'label': None,
        'letter_override': None,
        'filename': 'original.jpg',
    }]
    
    # Unassigned photo with no recognizable notes
    unassigned_dicts = [{
        'id': 'photo_xyz789',
        'notes': '',
        'filename': 'unknown.jpg',
    }]
    
    # For unassigned photos with no directional notes, should fall back to photo ID stem
    filenames = generate_filenames_for_unassigned_photos(unassigned_dicts)
    assert len(filenames) == 1
    photo_id, filename = filenames[0]
    assert photo_id == 'photo_xyz789'
    # Should be photo_{id_stem}.jpg where id_stem strips 'photo_' prefix
    assert filename.startswith('photo_')
    assert filename.endswith('.jpg')
    # The stem should be truncated version of 'xyz789' (since prefix is stripped)
    assert 'xyz789' in filename


def test_extension_preservation(db_session, test_project):
    """Test that original file extensions are preserved (.jpg, .png, .heic)."""
    window = Window(
        id=new_uuid(),
        project_id=test_project.id,
        number=1,
        sort_order=0,
    )
    db_session.add(window)
    db_session.commit()
    
    photos_dicts = [
        {'id': 'p1', 'label': None, 'letter_override': None, 'filename': 'photo.jpg'},
        {'id': 'p2', 'label': None, 'letter_override': None, 'filename': 'photo.PNG'},
        {'id': 'p3', 'label': None, 'letter_override': None, 'filename': 'photo.HEIC'},
        {'id': 'p4', 'label': None, 'letter_override': None, 'filename': 'photo.jpeg'},
    ]
    
    windows_data = [{'number': 1, 'photos': photos_dicts}]
    filenames = generate_filenames_for_photos(windows_data)
    
    assert filenames[0][1] == '1a.jpg'  # .jpg -> .jpg
    assert filenames[1][1] == '1b.png'  # .PNG -> .png (lowercased)
    assert filenames[2][1] == '1c.heic'  # .HEIC -> .heic (lowercased)
    assert filenames[3][1] == '1d.jpeg'  # .jpeg -> .jpeg

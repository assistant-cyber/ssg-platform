"""Tests for Phase 3: atomic pin label assignment and stable ordering."""
import sys
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from main import app
from app.models import Photo, PhotoPin, Project, User, new_uuid
from app.dependencies import hash_pin


# ── Test fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def test_db():
    """In-memory SQLite database for each test."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def client(test_db):
    """FastAPI test client with dependency override."""
    def override_get_db():
        try:
            yield test_db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def staff_user(test_db):
    """Staff user for auth."""
    user = User(
        id=new_uuid(),
        name="Test Staff",
        role="staff",
        pin_hash=hash_pin("1234"),
        is_active=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture(scope="function")
def auth_headers(client, staff_user):
    """Auth headers for staff user."""
    response = client.post("/auth/login", json={"code": "1234"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def project(test_db, staff_user):
    """Test project."""
    proj = Project(
        id=new_uuid(),
        name="Test Project",
        assigned_staff_id=staff_user.id,
    )
    test_db.add(proj)
    test_db.commit()
    test_db.refresh(proj)
    return proj


@pytest.fixture(scope="function")
def elevation_photo(test_db, project):
    """Elevation photo for pin placement."""
    photo = Photo(
        id=new_uuid(),
        project_id=project.id,
        storage_url="s3://test/photo.jpg",
        filename="North.jpg",
        is_elevation=True,
        sort_order=0,
    )
    test_db.add(photo)
    test_db.commit()
    test_db.refresh(photo)
    return photo


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_atomic_label_assignment(client, auth_headers, elevation_photo):
    """Server assigns sequential labels when client sends None."""
    # Create three pins without labels
    response1 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 10, "y_pct": 10, "label": None, "color": "red"},
        headers=auth_headers,
    )
    assert response1.status_code == 201
    pin1 = response1.json()
    assert pin1["label"] == "1"
    assert pin1["sort_order"] == 0
    
    response2 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 20, "y_pct": 20, "label": None, "color": "blue"},
        headers=auth_headers,
    )
    assert response2.status_code == 201
    pin2 = response2.json()
    assert pin2["label"] == "2"
    assert pin2["sort_order"] == 1
    
    response3 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 30, "y_pct": 30, "label": None, "color": "green"},
        headers=auth_headers,
    )
    assert response3.status_code == 201
    pin3 = response3.json()
    assert pin3["label"] == "3"
    assert pin3["sort_order"] == 2


def test_label_not_reused_after_delete(client, auth_headers, elevation_photo):
    """Deleting pin 1 then creating → gets label 3, not 1 (labels are stable)."""
    # Create pins 1, 2
    r1 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 10, "y_pct": 10, "label": None, "color": "red"},
        headers=auth_headers,
    )
    assert r1.status_code == 201
    pin1_id = r1.json()["id"]
    assert r1.json()["label"] == "1"
    
    r2 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 20, "y_pct": 20, "label": None, "color": "blue"},
        headers=auth_headers,
    )
    assert r2.status_code == 201
    assert r2.json()["label"] == "2"
    
    # Delete pin 1
    delete_resp = client.delete(f"/photo-pins/{pin1_id}", headers=auth_headers)
    assert delete_resp.status_code == 204
    
    # Create new pin → should be 3, not 1
    r3 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 30, "y_pct": 30, "label": None, "color": "green"},
        headers=auth_headers,
    )
    assert r3.status_code == 201
    assert r3.json()["label"] == "3"


def test_renumber_endpoint_compacts_to_1_n(client, auth_headers, elevation_photo):
    """Renumber endpoint compacts labels to 1..N in sort_order."""
    # Create pins 1, 2, 3
    r1 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 10, "y_pct": 10, "label": None, "color": "red"},
        headers=auth_headers,
    )
    pin1_id = r1.json()["id"]
    
    r2 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 20, "y_pct": 20, "label": None, "color": "blue"},
        headers=auth_headers,
    )
    pin2_id = r2.json()["id"]
    
    r3 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 30, "y_pct": 30, "label": None, "color": "green"},
        headers=auth_headers,
    )
    pin3_id = r3.json()["id"]
    
    # Delete pin 1
    client.delete(f"/photo-pins/{pin1_id}", headers=auth_headers)
    
    # Before renumber: pins have labels 2, 3
    # Renumber should compact to 1, 2
    renumber_resp = client.post(
        f"/photos/{elevation_photo.id}/pins/renumber",
        headers=auth_headers,
    )
    assert renumber_resp.status_code == 200
    pins = renumber_resp.json()
    assert len(pins) == 2
    
    # Sort by sort_order to ensure stable ordering
    pins_sorted = sorted(pins, key=lambda p: p["sort_order"])
    assert pins_sorted[0]["id"] == pin2_id
    assert pins_sorted[0]["label"] == "1"
    assert pins_sorted[1]["id"] == pin3_id
    assert pins_sorted[1]["label"] == "2"


def test_ordering_stability(client, auth_headers, elevation_photo, test_db):
    """Pins returned ORDER BY sort_order, created_at."""
    # Create 3 pins
    client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 10, "y_pct": 10, "label": None, "color": "red"},
        headers=auth_headers,
    )
    client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 20, "y_pct": 20, "label": None, "color": "blue"},
        headers=auth_headers,
    )
    client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 30, "y_pct": 30, "label": None, "color": "green"},
        headers=auth_headers,
    )
    
    # Get photo with pins
    photo_resp = client.get(f"/photos/{elevation_photo.id}", headers=auth_headers)
    assert photo_resp.status_code == 200
    pins = photo_resp.json()["pins"]
    assert len(pins) == 3
    
    # Verify ordering
    assert pins[0]["label"] == "1"
    assert pins[0]["sort_order"] == 0
    assert pins[1]["label"] == "2"
    assert pins[1]["sort_order"] == 1
    assert pins[2]["label"] == "3"
    assert pins[2]["sort_order"] == 2


def test_explicit_label_preserved(client, auth_headers, elevation_photo):
    """When client provides a label, server uses it (no auto-increment)."""
    response = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 10, "y_pct": 10, "label": "custom-label", "color": "red"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["label"] == "custom-label"
    
    # Next auto-assigned label should still be 1 (custom-label is non-numeric)
    response2 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 20, "y_pct": 20, "label": None, "color": "blue"},
        headers=auth_headers,
    )
    assert response2.status_code == 201
    assert response2.json()["label"] == "1"


def test_concurrent_label_assignment(client, auth_headers, elevation_photo):
    """Two rapid creates without labels get sequential labels 1, 2."""
    # Simulate concurrent-ish creation (sequential in test, but atomicity ensures correctness)
    r1 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 10, "y_pct": 10, "label": None, "color": "red"},
        headers=auth_headers,
    )
    r2 = client.post(
        f"/photos/{elevation_photo.id}/pins",
        json={"x_pct": 20, "y_pct": 20, "label": None, "color": "blue"},
        headers=auth_headers,
    )
    
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["label"] == "1"
    assert r2.json()["label"] == "2"

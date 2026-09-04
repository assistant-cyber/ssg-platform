"""Tests for overview data aggregation (Phase 10)."""
import sys
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import (
    Project, Window, Photo, ConditionData, Estimate, EstimateLineItem,
    User, new_uuid
)
from app.dependencies import hash_pin
from processing.overview_data import aggregate_overview_data


# ── Test fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def test_db():
    """In-memory SQLite database for each test.

    StaticPool is required: without it every pooled connection gets its own
    empty :memory: database, so tables created via create_all are invisible
    to the session/TestClient connections ("no such table" errors).
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


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
def project(test_db, staff_user):
    """Test project."""
    proj = Project(
        id=new_uuid(),
        name="Test Church",
        church_name="St. Test",
        assigned_staff_id=staff_user.id,
    )
    test_db.add(proj)
    test_db.commit()
    test_db.refresh(proj)
    return proj


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_aggregate_full_data(test_db, project):
    """Test aggregation with full window + photo + AI + condition data."""
    # Create window with photos that have AI vision data and ConditionData
    window = Window(
        id=new_uuid(),
        project_id=project.id,
        number=1,
        name="Nave Window",
        notes="Beautiful rose window with some deterioration.",
        sort_order=0,
    )
    test_db.add(window)
    test_db.commit()
    
    photo1 = Photo(
        id=new_uuid(),
        project_id=project.id,
        window_id=window.id,
        storage_url="https://example.com/photo1.jpg",
        window_number="1",
        panel_letter="A",
        ai_panes=3,
        ai_panels=2,
        ai_sqft=12.5,
        ai_pieces=45,
        sort_order=0,
    )
    test_db.add(photo1)
    test_db.commit()
    
    condition1 = ConditionData(
        id=new_uuid(),
        photo_id=photo1.id,
        project_id=project.id,
        window_num="1",
        panel_letter="A",
        warping=3,
        lead_det=2,
        breaks=5,
        wood_rot=True,
        paint_fail=False,
        pieces=40,  # AI pieces (45) should take priority
    )
    test_db.add(condition1)
    test_db.commit()
    
    result = aggregate_overview_data(project.id, test_db)
    
    assert result["total_windows"] == 1
    assert result["total_photos"] == 1
    assert len(result["windows"]) == 1
    
    win = result["windows"][0]
    assert win["number"] == 1
    assert win["name"] == "Nave Window"
    assert win["notes"] == "Beautiful rose window with some deterioration."
    assert win["panes"] == 3
    assert win["panels"] == 2
    assert win["sqft"] == 12.5
    assert win["pieces"] == 45  # Staff-edited ai_pieces takes priority over ConditionData.pieces
    assert win["max_warping"] == 3
    assert win["max_lead_det"] == 2
    assert win["total_breaks"] == 5
    assert win["has_wood_rot"] is True
    assert win["has_paint_fail"] is False
    
    assert result["totals"]["total_sqft"] == 12.5
    assert result["totals"]["total_pieces"] == 45
    assert result["totals"]["total_panels"] == 2
    assert result["totals"]["windows_with_sqft"] == 1
    assert result["totals"]["windows_with_pieces"] == 1
    assert result["totals"]["windows_with_panels"] == 1
    
    assert result["condition_rollup"]["avg_warping"] == 3.0
    assert result["condition_rollup"]["max_warping"] == 3
    assert result["condition_rollup"]["avg_lead_det"] == 2.0
    assert result["condition_rollup"]["max_lead_det"] == 2
    assert result["condition_rollup"]["total_breaks"] == 5
    assert result["condition_rollup"]["windows_with_wood_rot"] == 1
    assert result["condition_rollup"]["windows_with_paint_fail"] == 0
    
    assert result["estimate_summary"] is None


def test_aggregate_partial_data(test_db, project):
    """Test aggregation with some windows missing AI and ConditionData."""
    # Window 1: has AI data and ConditionData
    window1 = Window(id=new_uuid(), project_id=project.id, number=1, sort_order=0)
    test_db.add(window1)
    
    photo1 = Photo(
        id=new_uuid(),
        project_id=project.id,
        window_id=window1.id,
        storage_url="https://example.com/photo1.jpg",
        window_number="1",
        ai_sqft=10.0,
        ai_pieces=30,
        sort_order=0,
    )
    test_db.add(photo1)
    test_db.commit()
    
    condition1 = ConditionData(
        id=new_uuid(),
        photo_id=photo1.id,
        project_id=project.id,
        window_num="1",
        warping=2,
        breaks=3,
    )
    test_db.add(condition1)
    
    # Window 2: no AI data, no ConditionData
    window2 = Window(id=new_uuid(), project_id=project.id, number=2, sort_order=1)
    test_db.add(window2)
    
    photo2 = Photo(
        id=new_uuid(),
        project_id=project.id,
        window_id=window2.id,
        storage_url="https://example.com/photo2.jpg",
        window_number="2",
        sort_order=0,
    )
    test_db.add(photo2)
    test_db.commit()
    
    result = aggregate_overview_data(project.id, test_db)
    
    assert result["total_windows"] == 2
    assert result["total_photos"] == 2
    
    # Window 1 has data
    win1 = result["windows"][0]
    assert win1["number"] == 1
    assert win1["sqft"] == 10.0
    assert win1["pieces"] == 30
    assert win1["max_warping"] == 2
    assert win1["total_breaks"] == 3
    
    # Window 2 has no data (all None)
    win2 = result["windows"][1]
    assert win2["number"] == 2
    assert win2["sqft"] is None
    assert win2["pieces"] is None
    assert win2["max_warping"] is None
    assert win2["total_breaks"] == 0
    
    # Totals only count windows with data
    assert result["totals"]["total_sqft"] == 10.0
    assert result["totals"]["total_pieces"] == 30
    assert result["totals"]["windows_with_sqft"] == 1
    assert result["totals"]["windows_with_pieces"] == 1


def test_aggregate_empty_project(test_db, project):
    """Test aggregation with no windows or photos."""
    result = aggregate_overview_data(project.id, test_db)
    
    assert result["total_windows"] == 0
    assert result["total_photos"] == 0
    assert result["windows"] == []
    assert result["totals"]["total_sqft"] == 0.0
    assert result["totals"]["total_pieces"] == 0
    assert result["totals"]["total_panels"] == 0
    assert result["condition_rollup"]["avg_warping"] is None
    assert result["condition_rollup"]["max_warping"] is None
    assert result["condition_rollup"]["total_breaks"] == 0
    assert result["estimate_summary"] is None


def test_staff_edit_priority(test_db, project):
    """Test that staff-edited ai_pieces takes priority over ConditionData.pieces."""
    window = Window(id=new_uuid(), project_id=project.id, number=1, sort_order=0)
    test_db.add(window)
    
    # Photo with staff-edited ai_pieces
    photo1 = Photo(
        id=new_uuid(),
        project_id=project.id,
        window_id=window.id,
        storage_url="https://example.com/photo1.jpg",
        window_number="1",
        ai_pieces=100,  # Staff edited this
        sort_order=0,
    )
    test_db.add(photo1)
    test_db.commit()
    
    # ConditionData with different pieces count
    condition1 = ConditionData(
        id=new_uuid(),
        photo_id=photo1.id,
        project_id=project.id,
        window_num="1",
        pieces=50,  # Shorthand parsed count (should be ignored)
    )
    test_db.add(condition1)
    test_db.commit()
    
    result = aggregate_overview_data(project.id, test_db)
    
    # ai_pieces should win
    assert result["windows"][0]["pieces"] == 100
    assert result["totals"]["total_pieces"] == 100


def test_condition_rollup_math(test_db, project):
    """Test condition rollup aggregates correctly across multiple windows."""
    # Window 1
    window1 = Window(id=new_uuid(), project_id=project.id, number=1, sort_order=0)
    test_db.add(window1)
    photo1 = Photo(
        id=new_uuid(),
        project_id=project.id,
        window_id=window1.id,
        storage_url="https://example.com/photo1.jpg",
        window_number="1",
        sort_order=0,
    )
    test_db.add(photo1)
    test_db.commit()
    
    condition1 = ConditionData(
        id=new_uuid(),
        photo_id=photo1.id,
        project_id=project.id,
        window_num="1",
        warping=4,
        lead_det=3,
        breaks=10,
        wood_rot=True,
        paint_fail=True,
    )
    test_db.add(condition1)
    
    # Window 2
    window2 = Window(id=new_uuid(), project_id=project.id, number=2, sort_order=1)
    test_db.add(window2)
    photo2 = Photo(
        id=new_uuid(),
        project_id=project.id,
        window_id=window2.id,
        storage_url="https://example.com/photo2.jpg",
        window_number="2",
        sort_order=0,
    )
    test_db.add(photo2)
    test_db.commit()
    
    condition2 = ConditionData(
        id=new_uuid(),
        photo_id=photo2.id,
        project_id=project.id,
        window_num="2",
        warping=2,
        lead_det=1,
        breaks=5,
        wood_rot=False,
        paint_fail=True,
    )
    test_db.add(condition2)
    test_db.commit()
    
    result = aggregate_overview_data(project.id, test_db)
    
    # Averages
    assert result["condition_rollup"]["avg_warping"] == pytest.approx(3.0)  # (4 + 2) / 2
    assert result["condition_rollup"]["avg_lead_det"] == pytest.approx(2.0)  # (3 + 1) / 2
    
    # Maximums
    assert result["condition_rollup"]["max_warping"] == 4
    assert result["condition_rollup"]["max_lead_det"] == 3
    
    # Totals
    assert result["condition_rollup"]["total_breaks"] == 15  # 10 + 5
    assert result["condition_rollup"]["windows_with_wood_rot"] == 1
    assert result["condition_rollup"]["windows_with_paint_fail"] == 2


def test_estimate_summary(test_db, project, staff_user):
    """Test estimate summary is included when estimate exists."""
    # Create estimate with line items
    estimate = Estimate(
        id=new_uuid(),
        project_id=project.id,
        created_by_id=staff_user.id,
        status="draft",
        total_amount=15000.0,
    )
    test_db.add(estimate)
    test_db.commit()
    
    line1 = EstimateLineItem(
        id=new_uuid(),
        estimate_id=estimate.id,
        description="Panel restoration",
        quantity=5,
        unit="panel",
        unit_price=1000.0,
        total=5000.0,
        sort_order=0,
    )
    line2 = EstimateLineItem(
        id=new_uuid(),
        estimate_id=estimate.id,
        description="Frame repair",
        quantity=10,
        unit="sqft",
        unit_price=100.0,
        total=1000.0,
        sort_order=1,
    )
    test_db.add(line1)
    test_db.add(line2)
    test_db.commit()
    
    result = aggregate_overview_data(project.id, test_db)
    
    assert result["estimate_summary"] is not None
    assert result["estimate_summary"]["total_value"] == 15000.0
    assert result["estimate_summary"]["line_item_count"] == 2


def test_estimate_summary_absence(test_db, project):
    """Test estimate summary is None when no estimate exists."""
    result = aggregate_overview_data(project.id, test_db)
    assert result["estimate_summary"] is None


def test_notes_truncation(test_db, project):
    """Test that window notes are truncated to 200 characters."""
    long_notes = "A" * 300  # 300 characters
    
    window = Window(
        id=new_uuid(),
        project_id=project.id,
        number=1,
        notes=long_notes,
        sort_order=0,
    )
    test_db.add(window)
    test_db.commit()
    
    result = aggregate_overview_data(project.id, test_db)
    
    win_notes = result["windows"][0]["notes"]
    assert len(win_notes) == 200  # 197 chars + "..."
    assert win_notes.endswith("...")


def test_max_aggregation_across_photos(test_db, project):
    """Test that max values are used when multiple photos exist per window."""
    window = Window(id=new_uuid(), project_id=project.id, number=1, sort_order=0)
    test_db.add(window)
    
    # Photo 1: sqft=10, pieces=30
    photo1 = Photo(
        id=new_uuid(),
        project_id=project.id,
        window_id=window.id,
        storage_url="https://example.com/photo1.jpg",
        window_number="1",
        ai_sqft=10.0,
        ai_pieces=30,
        sort_order=0,
    )
    test_db.add(photo1)
    
    # Photo 2: sqft=15 (higher), pieces=25 (lower)
    photo2 = Photo(
        id=new_uuid(),
        project_id=project.id,
        window_id=window.id,
        storage_url="https://example.com/photo2.jpg",
        window_number="1",
        ai_sqft=15.0,
        ai_pieces=25,
        sort_order=1,
    )
    test_db.add(photo2)
    test_db.commit()
    
    result = aggregate_overview_data(project.id, test_db)
    
    # Should use max sqft (15) and max pieces (30)
    assert result["windows"][0]["sqft"] == 15.0
    assert result["windows"][0]["pieces"] == 30

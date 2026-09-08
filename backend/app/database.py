"""SQLAlchemy engine, session, and table-creation helpers."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


# Railway provides postgres:// but SQLAlchemy 2.x requires postgresql://
_db_url = settings.DATABASE_URL
if _db_url.startswith("postgres://"):
        _db_url = _db_url.replace("postgres://", "postgresql://", 1)
    
# Build engine — SQLite needs check_same_thread=False for FastAPI
connect_args = {}
if _db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
            _db_url,
    connect_args=connect_args,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Shared declarative base for all models."""
    pass


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_additive_columns() -> None:
    """Add newly-introduced nullable columns to tables that already exist.

    This project has no Alembic migration chain - Base.metadata.create_all()
    only creates tables that are missing entirely, it will NOT add new columns
    to a table that already exists in production (Railway/Postgres). Since we
    can't rely on a migration tool, new nullable columns get added here in an
    idempotent, additive-only way so they show up on both SQLite (dev) and
    Postgres (prod) the first time the app boots after a model change.

    Only ever ADD nullable columns here - never rename/drop/alter existing
    ones, since that's not safe to do blindly against a live database.
    """
    from sqlalchemy import inspect, text

    is_sqlite = _db_url.startswith("sqlite")
    inspector = inspect(engine)
    if "projects" not in inspector.get_table_names():
        return  # brand new DB - create_all() above already created it in full

    existing_columns = {col["name"] for col in inspector.get_columns("projects")}
    numeric_type = "REAL" if is_sqlite else "DOUBLE PRECISION"
    new_columns = {
        "replacement_value": numeric_type,
        "antique_value": numeric_type,
    }

    with engine.begin() as conn:
        for column_name, column_type in new_columns.items():
            if column_name not in existing_columns:
                conn.execute(text(f"ALTER TABLE projects ADD COLUMN {column_name} {column_type}"))

    # photos.is_elevation - marks a photo as a wide exterior/elevation shot
    # eligible for pin placement. New DBs get it via create_all(); existing
    # ones need the column added here. Boolean columns need a default+backfill
    # on Postgres since existing rows can't satisfy a NOT NULL constraint for
    # a column that didn't exist yet.
    if "photos" in inspector.get_table_names():
        photo_columns = {col["name"] for col in inspector.get_columns("photos")}
        if "is_elevation" not in photo_columns:
            bool_type = "BOOLEAN" if not is_sqlite else "BOOLEAN"
            default_literal = "0" if is_sqlite else "FALSE"
            with engine.begin() as conn:
                conn.execute(text(
                    f"ALTER TABLE photos ADD COLUMN is_elevation {bool_type} "
                    f"NOT NULL DEFAULT {default_literal}"
                ))

        # dim_width/dim_height/dim_depth - manually-entered window dimensions
        # (inches), separate from the shorthand-parsed condition dims.
        dim_columns = {
            "dim_width": numeric_type,
            "dim_height": numeric_type,
            "dim_depth": numeric_type,
        }
        with engine.begin() as conn:
            for column_name, column_type in dim_columns.items():
                if column_name not in photo_columns:
                    conn.execute(text(f"ALTER TABLE photos ADD COLUMN {column_name} {column_type}"))

        # PHASE 1: Window model columns
        # window_id, captured_at, capture_sequence, letter_override
        phase1_columns = {
            "window_id": "VARCHAR",  # FK to windows.id
            "captured_at": "TIMESTAMP",
            "capture_sequence": "INTEGER",
            "letter_override": "VARCHAR",
        }
        with engine.begin() as conn:
            for column_name, column_type in phase1_columns.items():
                if column_name not in photo_columns:
                    conn.execute(text(f"ALTER TABLE photos ADD COLUMN {column_name} {column_type}"))

        # AI-estimated condition assessment (warping/lead/breaks/rot/paint) -
        # lets the report's Overview page populate Condition Breakdown / Frame
        # Work from AI vision analysis alone, without requiring shorthand notes.
        ai_condition_int_columns = {
            "ai_warping": "INTEGER",
            "ai_lead_det": "INTEGER",
            "ai_breaks": "INTEGER",
        }
        with engine.begin() as conn:
            for column_name, column_type in ai_condition_int_columns.items():
                if column_name not in photo_columns:
                    conn.execute(text(f"ALTER TABLE photos ADD COLUMN {column_name} {column_type}"))

        ai_condition_bool_columns = ["ai_wood_rot", "ai_paint_fail"]
        bool_type = "BOOLEAN"
        with engine.begin() as conn:
            for column_name in ai_condition_bool_columns:
                if column_name not in photo_columns:
                    # Nullable (no default/backfill needed) - unlike is_elevation,
                    # these represent "not yet analyzed" as NULL, not False.
                    conn.execute(text(f"ALTER TABLE photos ADD COLUMN {column_name} {bool_type}"))

    # proposals.status / proposals.proposal_draft - Phase 5 columns that were
    # added to the Proposal model but never given an additive-migration entry,
    # so existing production databases never got them. This broke every
    # lazy-load of Project.proposals (including the DELETE /projects/{id}
    # cascade, which touches proposals via ORM relationship cleanup) with
    # "column proposals.proposal_draft does not exist".
    if "proposals" in inspector.get_table_names():
        proposal_columns = {col["name"] for col in inspector.get_columns("proposals")}

        if "status" not in proposal_columns:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE proposals ADD COLUMN status VARCHAR NOT NULL DEFAULT 'pending'"
                ))

        if "proposal_draft" not in proposal_columns:
            json_type = "JSON" if not is_sqlite else "JSON"
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE proposals ADD COLUMN proposal_draft {json_type}"))


def create_tables() -> None:
    """Import all models so their metadata is registered, then create tables."""
    # Importing models here registers them with Base.metadata
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _ensure_additive_columns()

#!/usr/bin/env python3
"""Data migration: Add AI analysis columns to Photo table.

This script adds nullable AI vision analysis columns to the Photo model:
- ai_panes, ai_panels, ai_sqft, ai_pieces (numeric estimates)
- ai_analyzed_at (timestamp)
- ai_analysis_notes (short caveats)

Safe to run multiple times (idempotent - columns are nullable, no backfill needed).
"""
import sys
from pathlib import Path

# Add backend to path so we can import app modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import SessionLocal, engine
from sqlalchemy import inspect, Column, Integer, Float, DateTime, Text


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    inspector = inspect(engine)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def main():
    """Run the migration."""
    print("=" * 60)
    print("SSG Data Migration: Add AI Analysis Columns to Photo")
    print("=" * 60)
    print()

    # Check if columns already exist
    if column_exists("photos", "ai_panes"):
        print("AI analysis columns already exist in photos table.")
        print("Migration not needed - skipping.")
        return

    db = SessionLocal()

    try:
        # Add columns via raw SQL (works for both SQLite and Postgres)
        print("Adding AI analysis columns to photos table...")
        
        db.execute(text("ALTER TABLE photos ADD COLUMN ai_panes INTEGER"))
        db.execute(text("ALTER TABLE photos ADD COLUMN ai_panels INTEGER"))
        db.execute(text("ALTER TABLE photos ADD COLUMN ai_sqft REAL"))
        db.execute(text("ALTER TABLE photos ADD COLUMN ai_pieces INTEGER"))
        db.execute(text("ALTER TABLE photos ADD COLUMN ai_analyzed_at TIMESTAMP"))
        db.execute(text("ALTER TABLE photos ADD COLUMN ai_analysis_notes TEXT"))
        
        db.commit()
        
        print("✓ Successfully added 6 AI analysis columns")
        print()
        print("=" * 60)
        print("Migration complete!")
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
    # Import text here to avoid early import issues
    from sqlalchemy import text
    main()

"""Database seed script — creates the initial staff user with PIN 0000."""
import sys
import os

# Ensure the backend directory is in the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, create_tables
from app.models import User, new_uuid
from app.security import hash_pin


DEFAULT_PIN = "0000"
DEFAULT_NAME = "Admin"


def seed():
    create_tables()
    db = SessionLocal()
    try:
        existing_staff = db.query(User).filter(User.role == "staff").first()
        if existing_staff:
            print(f"Staff user already exists: '{existing_staff.name}' (id: {existing_staff.id})")
            print("No seed needed.")
            return

        user = User(
            id=new_uuid(),
            name=DEFAULT_NAME,
            role="staff",
            pin_hash=hash_pin(DEFAULT_PIN),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        print("=" * 60)
        print("  Scottish Stained Glass Platform — Database Seeded")
        print("=" * 60)
        print()
        print(f"  Staff user created:")
        print(f"    Name:  {user.name}")
        print(f"    ID:    {user.id}")
        print(f"    PIN:   {DEFAULT_PIN}  ← change this in production!")
        print()
        print("  Login with:")
        print(f'    curl -X POST http://localhost:8000/login \\')
        print(f'      -H "Content-Type: application/json" \\')
        print(f'      -d \'{{"code": "{DEFAULT_PIN}"}}\'')
        print()
        print("  API docs:  http://localhost:8000/docs")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    seed()

"""FastAPI dependency functions — authentication disabled for open access."""
import logging
from typing import Optional

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import hash_pin

log = logging.getLogger(__name__)

STAFF_ROLES = {"staff", "admin"}

# Sentinel id used by the disabled-auth dependency. This row must exist in the
# `users` table because the projects table has a foreign key on
# `assigned_staff_id` — pointing at a non-existent user violates that FK in
# Postgres (SQLite silently ignores it, which is why this bug only surfaced
# against the production Supabase database). See create_sentinel_admin().
SENTINEL_ADMIN_ID = "00000000-0000-0000-0000-000000000000"
SENTINEL_ADMIN_NAME = "Dashboard System User"
SENTINEL_ADMIN_PIN = "0000"  # placeholder; auth is disabled, never validated


def is_staff_role(role: Optional[str]) -> bool:
    return (role or "").lower() in STAFF_ROLES


def create_sentinel_admin(db: Session) -> User:
    """Ensure the disabled-auth sentinel admin row exists, then return it.

    Idempotent: if the row already exists it's returned as-is. The row is
    required to satisfy the projects.assigned_staff_id foreign key in
    production (Supabase Postgres). SQLite tolerates the missing FK locally,
    which is why the original mock detached-user approach worked in dev and
    blew up in prod.
    """
    user = db.query(User).filter(User.id == SENTINEL_ADMIN_ID).first()
    if user is not None:
        return user

    user = User(
        id=SENTINEL_ADMIN_ID,
        name=SENTINEL_ADMIN_NAME,
        role="admin",
        pin_hash=hash_pin(SENTINEL_ADMIN_PIN),
        linked_project_id=None,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log.info("Created sentinel admin user %s for disabled-auth dependency", SENTINEL_ADMIN_ID)
    return user


def get_current_user(
    db: Session = Depends(get_db),
) -> User:
    """Authentication disabled — return a real admin user from the DB.

    Returns the sentinel admin row, creating it on first call if missing. The
    returned instance is a real ORM User so foreign keys and relationships
    work correctly in production. If the DB is unreachable, falls back to a
    detached mock so the request path doesn't hard-fail (matches the previous
    behavior in that failure mode).
    """
    try:
        return create_sentinel_admin(db)
    except Exception as exc:  # pragma: no cover - defensive fallback
        log.warning("Falling back to detached mock user (DB unavailable?): %s", exc)
        mock = User()
        mock.id = SENTINEL_ADMIN_ID
        mock.name = SENTINEL_ADMIN_NAME
        mock.role = "admin"
        mock.is_active = True
        return mock


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    return current_user


def get_current_user_or_customer(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user

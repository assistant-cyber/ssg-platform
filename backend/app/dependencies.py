"""FastAPI dependency functions — authentication disabled for open access."""
from typing import Optional

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

STAFF_ROLES = {"staff", "admin"}


def is_staff_role(role: Optional[str]) -> bool:
    return (role or "").lower() in STAFF_ROLES


def get_current_user(
    db: Session = Depends(get_db),
) -> User:
    """Authentication disabled — return a mock admin user."""
    mock = User()
    mock.id = "00000000-0000-0000-0000-000000000000"
    mock.name = "Dashboard User"
    mock.role = "admin"
    mock.is_active = True
    return mock


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    return current_user


def get_current_user_or_customer(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user

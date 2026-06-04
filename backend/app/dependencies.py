"""FastAPI dependency functions — authentication disabled for open access."""
from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

STAFF_ROLES = {"staff", "admin"}


def is_staff_role(role: Optional[str]) -> bool:
    """Return True when the role should be treated as staff/admin access."""
    return (role or "").lower() in STAFF_ROLES


def get_current_user(
    db: Session = Depends(get_db),
) -> User:
    """Return the first active user — authentication is disabled."""
    user = db.query(User).filter(User.is_active == True).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No active users found in the database",
        )
    return user


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    """Authentication disabled — all requests treated as staff."""
    return current_user


def get_current_user_or_customer(
    current_user: User = Depends(get_current_user),
) -> User:
    """Authentication disabled — return default user."""
    return current_user

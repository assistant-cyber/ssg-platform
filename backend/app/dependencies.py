"""FastAPI dependency functions — JWT bearer authentication."""
import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_token, hash_pin  # hash_pin re-exported for tests/seeds

log = logging.getLogger(__name__)

STAFF_ROLES = {"staff", "admin"}

_bearer_scheme = HTTPBearer(auto_error=False)


def is_staff_role(role: Optional[str]) -> bool:
    return (role or "").lower() in STAFF_ROLES


def _credentials_error(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Validate the Bearer JWT and return the matching active user.

    Raises 401 when the token is missing, invalid, expired, or references a
    user that no longer exists / is deactivated.
    """
    if credentials is None or not credentials.credentials:
        raise _credentials_error()

    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise _credentials_error("Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise _credentials_error("Invalid token payload")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise _credentials_error("User not found or inactive")

    return user


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    """Allow only staff/admin users. Customers get 403."""
    if not is_staff_role(current_user.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff access required",
        )
    return current_user


def get_current_user_or_customer(
    current_user: User = Depends(get_current_user),
) -> User:
    """Any authenticated user (staff or customer).

    Customer project scoping is enforced in the routers via
    ``linked_project_id`` checks where applicable.
    """
    return current_user

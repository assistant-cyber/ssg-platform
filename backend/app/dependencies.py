"""FastAPI dependency functions for authentication and authorization."""
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_token

_bearer = HTTPBearer(auto_error=True)
STAFF_ROLES = {"staff", "admin"}


def is_staff_role(role: Optional[str]) -> bool:
    """Return True when the role should be treated as staff/admin access."""
    return (role or "").lower() in STAFF_ROLES


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Decode the JWT and return the authenticated User.

    Raises HTTP 401 if the token is missing, invalid, or the user no longer exists.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise credentials_exception

    return user


def require_staff(current_user: User = Depends(get_current_user)) -> User:
    """Raise HTTP 403 if the authenticated user is not a staff member."""
    if not is_staff_role(current_user.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff access required",
        )
    return current_user


def get_current_user_or_customer(
    current_user: User = Depends(get_current_user),
) -> User:
    """Allow both staff and customer roles (any authenticated user)."""
    return current_user

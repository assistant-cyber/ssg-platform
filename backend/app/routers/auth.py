"""Authentication router — PIN-based login."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse
from app.security import create_access_token, verify_pin

router = APIRouter(tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with a PIN code.

    Iterates over all active users and bcrypt-verifies the provided code
    against each stored pin_hash.  Returns a JWT on success, 401 on failure.
    """
    active_users = db.query(User).filter(User.is_active == True).all()

    for user in active_users:
        if verify_pin(body.code, user.pin_hash):
            token = create_access_token({"sub": user.id, "role": user.role})
            return TokenResponse(
                access_token=token,
                token_type="bearer",
                role=user.role,
                user_id=user.id,
                name=user.name,
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid PIN code",
        headers={"WWW-Authenticate": "Bearer"},
    )

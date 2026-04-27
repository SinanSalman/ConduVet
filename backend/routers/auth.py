"""
Auth router — /api/auth/*
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from sqlalchemy.orm import Session

from auth.jwt import create_access_token
from auth.ldap_stub import auth_provider
from database import get_db
from models.db_models import AppUser
from rate_limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
@limiter.limit("10/minute")
async def user_login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Authenticate a regular user.

    Looks up AppUser by userid (case-insensitive — stored as uppercase).
    Uses the configured auth_provider (LocalAuthProvider by default).
    Returns a JWT access token on success.
    """
    user = db.query(AppUser).filter(AppUser.userid == username.upper()).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not auth_provider.authenticate(username, password, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(
        data={"sub": user.userid, "scope": "user"},
        expires_delta=timedelta(hours=8),
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "name": user.name,
        "userid": user.userid,
    }

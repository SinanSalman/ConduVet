"""
Auth router — /api/auth/*
"""

import logging
import os
import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import exc as sqlalchemy_exc
from sqlalchemy.orm import Session

from auth.jwt import create_access_token, get_current_user
from auth.ldap_stub import auth_provider
from database import get_db
from models.db_models import AppUser, AppConfig, UserSession
from rate_limiter import limiter
from services.access_control import get_user_email, get_user_group, get_user_role
from services.email_service import send_pin_email
from services.session_service import logout_authenticated_session

logger = logging.getLogger("conduvet")

router = APIRouter(prefix="/api/auth", tags=["auth"])


# Request/Response models
class RequestPINRequest(BaseModel):
    userid: str


class VerifyPINRequest(BaseModel):
    userid: str
    pin_code: str


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

    # Create a user session record (best-effort; continue even if it fails)
    session_id = None
    try:
        session = UserSession(userid=user.userid, last_activity=datetime.now(timezone.utc))
        db.add(session)
        db.flush()
        session_id = session.id
        db.commit()
    except (sqlalchemy_exc.SQLAlchemyError, sqlalchemy_exc.IntegrityError) as e:
        db.rollback()
        session_id = None
        # Session creation failed, but authentication succeeded. Log it but don't fail.
        logger.warning(f"Failed to create UserSession for user {user.userid}: {e}")

    token_data = {"sub": user.userid, "scope": "user"}
    if session_id is not None:
        token_data["sid"] = session_id
    token = create_access_token(data=token_data, expires_delta=timedelta(hours=8))
    return {
        "access_token": token,
        "token_type": "bearer",
        "name": user.name,
        "userid": user.userid,
        "role": get_user_role(db, user.userid),
        "group": get_user_group(db, user.userid),
    }


@router.post("/request-pin")
@limiter.limit("10/minute")
async def request_pin(
    request: Request,
    body: RequestPINRequest,
    db: Session = Depends(get_db),
):
    """
    Request a PIN for email-based authentication.

    Validates that the user exists, generates a random 5-digit PIN,
    stores it in memory with expiration, and sends it via email.
    """
    # Lazy import to avoid circular import
    from main import _pin_store, send_email

    userid = body.userid.upper()

    # Validate user exists
    user = db.query(AppUser).filter(AppUser.userid == userid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Get app config for PIN_EXPIRATION_MINUTES
    config = db.query(AppConfig).first()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Application not configured",
        )

    pin_expiration_minutes = int(
        os.getenv("PIN_EXPIRATION_MINUTES", str(config.pin_expiration_minutes or 15))
    )

    # Generate random 5-digit PIN
    pin_code = "".join(random.choices(string.digits, k=5))

    # Calculate expiration time
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=pin_expiration_minutes)

    email = get_user_email(db, userid)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No email address is configured for this user",
        )

    # Store PIN in memory (overwrites any existing PIN for this user)
    _pin_store[userid] = {
        "pin": pin_code,
        "expires_at": expires_at,
        "email": email,
    }

    # Send PIN via email using the send_email function and config
    success = send_pin_email(email, userid, pin_code, send_email, pin_expiration_minutes)
    if not success:
        # Remove PIN from store if email sending fails
        del _pin_store[userid]
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send PIN email",
        )

    # Mask email for response (e.g., "u***@example.com")
    local_part, _, domain_part = email.partition("@")
    masked_email = f"{local_part[:1] if local_part else '*'}***@{domain_part}" if domain_part else "***"

    return {
        "message": "PIN sent to email",
        "email": masked_email,
    }


@router.post("/verify-pin")
@limiter.limit("10/minute")
async def verify_pin(
    request: Request,
    body: VerifyPINRequest,
    db: Session = Depends(get_db),
):
    """
    Verify a PIN and return a JWT token on success.

    Checks that the PIN exists, is not expired, and matches the provided code.
    Deletes the PIN from memory on successful verification.
    """
    # Lazy import to avoid circular import
    from main import _pin_store

    userid = body.userid.upper()
    pin_code = body.pin_code.strip()

    # Check if PIN exists in store
    if userid not in _pin_store:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired PIN",
        )

    pin_data = _pin_store[userid]

    # Check expiration
    now = datetime.now(timezone.utc)
    if now > pin_data["expires_at"]:
        del _pin_store[userid]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired PIN",
        )

    # Check PIN matches
    if pin_code != pin_data["pin"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired PIN",
        )

    # PIN is valid — remove from store and create token
    del _pin_store[userid]

    # Get user for token creation
    user = db.query(AppUser).filter(AppUser.userid == userid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Create a user session record (best-effort; continue even if it fails)
    session_id = None
    try:
        session = UserSession(userid=user.userid, last_activity=datetime.now(timezone.utc))
        db.add(session)
        db.flush()
        session_id = session.id
        db.commit()
    except (sqlalchemy_exc.SQLAlchemyError, sqlalchemy_exc.IntegrityError) as e:
        db.rollback()
        session_id = None
        # Session creation failed, but authentication succeeded. Log it but don't fail.
        logger.warning(f"Failed to create UserSession for user {user.userid}: {e}")

    # Create JWT token
    token_data = {"sub": user.userid, "scope": "user"}
    if session_id is not None:
        token_data["sid"] = session_id
    token = create_access_token(data=token_data, expires_delta=timedelta(hours=8))

    return {
        "access_token": token,
        "token_type": "bearer",
        "name": user.name,
        "userid": user.userid,
        "role": get_user_role(db, user.userid),
        "group": get_user_group(db, user.userid),
    }


@router.post("/logout")
def user_logout(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Logout a user by marking their current session as ended.
    """
    userid = current_user.get("sub")
    if not userid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine user ID",
        )

    # Mark the session tied to this token as logged out.
    try:
        if logout_authenticated_session(db, current_user):
            return {"message": "Logged out successfully"}
    except (sqlalchemy_exc.SQLAlchemyError, sqlalchemy_exc.IntegrityError) as e:
        db.rollback()
        # Session logout failed, but still return success
        logger.warning(f"Failed to mark logout for user {userid}: {e}")

    return {"message": "Logged out successfully"}

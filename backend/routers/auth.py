"""
Auth router — /api/auth/*
"""

import os
import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.jwt import create_access_token
from auth.ldap_stub import auth_provider
from database import get_db
from models.db_models import AppUser
from rate_limiter import limiter
from services.email_service import send_pin_email

# Import PIN store and config from main
from main import _pin_store, PIN_EXPIRATION_MINUTES, USER_DOMAIN

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
    userid = body.userid.upper()

    # Validate user exists
    user = db.query(AppUser).filter(AppUser.userid == userid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Generate random 5-digit PIN
    pin_code = "".join(random.choices(string.digits, k=5))

    # Calculate expiration time
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=PIN_EXPIRATION_MINUTES)

    # Store PIN in memory (overwrites any existing PIN for this user)
    email = f"{userid.lower()}@{USER_DOMAIN}"
    _pin_store[userid] = {
        "pin": pin_code,
        "expires_at": expires_at,
        "email": email,
    }

    # Send PIN via email
    success = send_pin_email(email, userid, pin_code)
    if not success:
        # Remove PIN from store if email sending fails
        del _pin_store[userid]
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send PIN email",
        )

    # Mask email for response (e.g., "u***@example.com")
    masked_email = f"{email[0]}***@{email.split('@')[1]}"

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

    # Create JWT token
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

"""
Session lifecycle helpers.

This module keeps the inactivity timeout logic in one place so authenticated
requests, explicit logouts, and active-session reporting all use the same rules.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from models.db_models import AppConfig, UserSession

DEFAULT_AUTO_LOGOUT_MINUTES = 30


def get_auto_logout_minutes(db: Session) -> int:
    """Return the configured inactivity timeout in minutes."""
    config = db.query(AppConfig).order_by(AppConfig.id.desc()).first()
    minutes = DEFAULT_AUTO_LOGOUT_MINUTES
    if config and config.auto_logout_minutes:
        try:
            minutes = int(config.auto_logout_minutes)
        except (TypeError, ValueError):
            minutes = DEFAULT_AUTO_LOGOUT_MINUTES
    return max(1, minutes)


def expire_stale_sessions(db: Session, now: datetime | None = None) -> int:
    """
    Mark sessions whose last_activity is older than the configured timeout as logged out.

    Returns the number of sessions closed.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=get_auto_logout_minutes(db))

    stale_sessions = (
        db.query(UserSession)
        .filter(
            UserSession.logout_at.is_(None),
            UserSession.last_activity < cutoff,
        )
        .all()
    )
    if not stale_sessions:
        return 0

    for session in stale_sessions:
        session.logout_at = now

    db.commit()
    return len(stale_sessions)


def _get_session_query(db: Session, payload: dict[str, Any]) -> UserSession | None:
    """Resolve the live UserSession row associated with a JWT payload."""
    userid = (payload.get("sub") or "").strip().upper()
    if not userid:
        return None

    session_id = payload.get("sid")
    query = db.query(UserSession).filter(
        UserSession.userid == userid,
        UserSession.logout_at.is_(None),
    )

    if session_id is not None:
        try:
            return query.filter(UserSession.id == int(session_id)).first()
        except (TypeError, ValueError):
            return None

    return query.order_by(UserSession.login_at.desc()).first()


def touch_authenticated_session(db: Session, payload: dict[str, Any]) -> bool:
    """
    Validate the session referenced by a JWT and refresh its last_activity.

    Returns True when the session is still active. Returns False and closes the
    session when it has expired or can no longer be resolved.
    """
    now = datetime.now(timezone.utc)
    session = _get_session_query(db, payload)
    if session is None:
        return False

    timeout_minutes = get_auto_logout_minutes(db)
    last_activity = session.last_activity or session.login_at or now
    cutoff = now - timedelta(minutes=timeout_minutes)
    if last_activity < cutoff:
        session.logout_at = now
        db.commit()
        return False

    session.last_activity = now
    db.commit()
    return True


def logout_authenticated_session(db: Session, payload: dict[str, Any]) -> bool:
    """
    Mark the JWT-associated session as ended.

    Falls back to the latest open session for the user if the token predates
    session-id claims.
    """
    session = _get_session_query(db, payload)
    if session is None:
        return False

    session.logout_at = datetime.now(timezone.utc)
    session.last_activity = session.logout_at
    db.commit()
    return True

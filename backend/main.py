"""
Conduvet — FastAPI application entry point.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from database import Base, SessionLocal, engine
from models import db_models  # noqa: F401 — ensure models are imported before create_all
from routers.admin import router as admin_router
from routers.auth import router as auth_router
from routers.data import router as data_router
from services.backup_service import setup_backup_scheduler

# ---------------------------------------------------------------------------
# Create all tables
# ---------------------------------------------------------------------------
Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Incremental schema migrations
# Each migration is idempotent (checks before altering).
# ---------------------------------------------------------------------------
def _run_migrations():
    """Apply any schema changes that create_all does not handle (column additions)."""
    with engine.connect() as conn:
        from sqlalchemy import text

        # Migration 001: add 'vetter' column to data_records if it does not exist.
        result = conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'data_records' AND column_name = 'vetter'"
            )
        )
        if result.fetchone() is None:
            conn.execute(
                text("ALTER TABLE data_records ADD COLUMN vetter VARCHAR(255) DEFAULT NULL")
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_data_records_vetter "
                    "ON data_records (vetter)"
                )
            )
            conn.commit()

        # Migration 002: add record locking columns
        result = conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'data_records' AND column_name = 'is_locked'"
            )
        )
        if result.fetchone() is None:
            conn.execute(
                text("ALTER TABLE data_records ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE")
            )
            conn.execute(
                text("ALTER TABLE data_records ADD COLUMN locked_by VARCHAR(255) DEFAULT NULL")
            )
            conn.execute(
                text("ALTER TABLE data_records ADD COLUMN locked_at TIMESTAMP DEFAULT NULL")
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_data_records_is_locked "
                    "ON data_records (is_locked)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_data_records_locked_by "
                    "ON data_records (locked_by)"
                )
            )
            conn.commit()

        # Migration 003: add auto_logout_minutes to AppConfig
        result = conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'app_config' AND column_name = 'auto_logout_minutes'"
            )
        )
        if result.fetchone() is None:
            conn.execute(
                text("ALTER TABLE app_config ADD COLUMN auto_logout_minutes INTEGER NOT NULL DEFAULT 30")
            )
            conn.commit()

        # Migration 004: update field_history foreign key to include ON DELETE CASCADE
        result = conn.execute(
            text(
                "SELECT constraint_name FROM information_schema.table_constraints "
                "WHERE table_name = 'field_history' AND constraint_type = 'FOREIGN KEY'"
            )
        )
        fk_info = result.fetchone()
        if fk_info:
            fk_name = fk_info[0]
            # Check if the constraint already has CASCADE delete
            cascade_check = conn.execute(
                text(
                    f"SELECT delete_rule FROM information_schema.referential_constraints "
                    f"WHERE constraint_name = '{fk_name}'"
                )
            )
            cascade_rule = cascade_check.fetchone()
            if cascade_rule and cascade_rule[0] != 'CASCADE':
                # Drop and recreate the foreign key with CASCADE
                conn.execute(
                    text(f"ALTER TABLE field_history DROP CONSTRAINT {fk_name}")
                )
                conn.execute(
                    text(
                        "ALTER TABLE field_history ADD CONSTRAINT field_history_record_id_fkey "
                        "FOREIGN KEY (record_id) REFERENCES data_records(id) ON DELETE CASCADE"
                    )
                )
                conn.commit()


_run_migrations()

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Conduvet",
    description="Crowd-sourced tabular data vetting platform",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()] if CORS_ORIGINS != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# "Not configured" middleware
# ---------------------------------------------------------------------------

# Routes that are always accessible even when the app is not yet configured
_ALWAYS_ALLOWED = {
    "/api/admin/status",
    "/api/admin/setup",
    "/api/admin/login",
    "/docs",
    "/openapi.json",
    "/redoc",
}


@app.middleware("http")
async def require_configured(request: Request, call_next):
    """
    If AppConfig has no row, block all requests except setup-related routes
    with 503 {"detail": "not_configured"}.
    """
    path = request.url.path
    # Always allow setup/login routes and docs
    if any(path == allowed or path.startswith(allowed) for allowed in _ALWAYS_ALLOWED):
        return await call_next(request)

    db = SessionLocal()
    try:
        from models.db_models import AppConfig
        configured = db.query(AppConfig).first() is not None
    finally:
        db.close()

    if not configured:
        return JSONResponse(
            status_code=503,
            content={"detail": "not_configured"},
        )

    return await call_next(request)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(data_router)

# ---------------------------------------------------------------------------
# Backup scheduler
# ---------------------------------------------------------------------------
setup_backup_scheduler(app)

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}

"""
Backup service — schedules periodic Excel exports to disk.

Rotation policy: max 24 backups per file; when the 25th would be written the
oldest existing backup for that file is deleted first.
"""

import io
import logging
import os
import re
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None

BACKUP_INTERVAL_HOURS = int(os.getenv("BACKUP_INTERVAL_HOURS", "2"))
MAX_BACKUPS_PER_FILE = 24


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def setup_backup_scheduler(app):
    """
    Attach a BackgroundScheduler to the FastAPI app lifecycle.

    Runs every BACKUP_INTERVAL_HOURS hours; backs up every active data file.
    Also runs PIN cleanup every 15 minutes.
    """
    global _scheduler

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _backup_all_files,
        trigger=IntervalTrigger(hours=BACKUP_INTERVAL_HOURS),
        id="backup_all_files",
        name="Backup all active data files",
        replace_existing=True,
        max_instances=1,
    )

    # Add PIN cleanup job
    from main import _cleanup_expired_pins

    _scheduler.add_job(
        _cleanup_expired_pins,
        trigger=IntervalTrigger(minutes=15),
        id="cleanup_expired_pins",
        name="Clean up expired email verification PINs",
        replace_existing=True,
        max_instances=1,
    )

    @app.on_event("startup")
    def start_scheduler():
        _scheduler.start()
        logger.info(
            "Backup scheduler started (interval=%dh).", BACKUP_INTERVAL_HOURS
        )

    @app.on_event("shutdown")
    def stop_scheduler():
        if _scheduler and _scheduler.running:
            _scheduler.shutdown(wait=False)
            logger.info("Backup scheduler stopped.")


def run_backup(file_id: int, db_session) -> str | None:
    """
    Run a single backup for one file.

    Returns the path of the written file, or None on failure.
    """
    from models.db_models import AppConfig, DataFile
    from services.excel_service import export_excel

    config = db_session.query(AppConfig).first()
    if config is None or not config.backup_dir:
        logger.warning("Backup skipped — no AppConfig or backup_dir configured.")
        return None

    data_file = (
        db_session.query(DataFile)
        .filter(DataFile.id == file_id, DataFile.is_active.is_(True))
        .first()
    )
    if data_file is None:
        logger.warning("Backup skipped — file_id=%d not found or inactive.", file_id)
        return None

    backup_dir = config.backup_dir
    os.makedirs(backup_dir, exist_ok=True)

    # Rotate — keep at most MAX_BACKUPS_PER_FILE
    _rotate_backups(backup_dir, data_file.display_name)

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M")
    # Sanitize display_name for filesystem use
    safe_name = re.sub(r"[^\w\- ]", "_", data_file.display_name).strip().replace(" ", "_")
    filename = f"{safe_name}_{ts}.xlsx"
    filepath = os.path.join(backup_dir, filename)

    try:
        xlsx_bytes = export_excel(file_id, db_session)
        with open(filepath, "wb") as fh:
            fh.write(xlsx_bytes)
        logger.info("Backup written: %s", filepath)
        return filepath
    except Exception:
        logger.exception("Backup failed for file_id=%d.", file_id)
        return None


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _backup_all_files():
    """Called by APScheduler — opens its own DB session."""
    from database import SessionLocal
    from models.db_models import DataFile

    db = SessionLocal()
    try:
        active_files = (
            db.query(DataFile).filter(DataFile.is_active.is_(True)).all()
        )
        for data_file in active_files:
            run_backup(data_file.id, db)
    finally:
        db.close()


def _existing_backups(backup_dir: str, display_name: str) -> list[str]:
    """
    Return sorted list (oldest first) of backup files for a given display_name.
    """
    safe_prefix = (
        re.sub(r"[^\w\- ]", "_", display_name).strip().replace(" ", "_") + "_"
    )
    try:
        files = [
            f
            for f in os.listdir(backup_dir)
            if f.startswith(safe_prefix) and f.endswith(".xlsx")
        ]
    except FileNotFoundError:
        return []
    files.sort()  # lexicographic sort works because timestamp is YYYYMMDD_HHMM
    return [os.path.join(backup_dir, f) for f in files]


def _rotate_backups(backup_dir: str, display_name: str):
    """Delete the oldest backup(s) so that writing one more stays ≤ MAX_BACKUPS."""
    existing = _existing_backups(backup_dir, display_name)
    while len(existing) >= MAX_BACKUPS_PER_FILE:
        oldest = existing.pop(0)
        try:
            os.remove(oldest)
            logger.info("Rotated old backup: %s", oldest)
        except OSError:
            logger.warning("Could not delete old backup: %s", oldest)

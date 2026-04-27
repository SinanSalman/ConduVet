"""
Shared response/audit helpers used by both the admin and user-facing routers.

Keeping these here (rather than duplicated in admin.py and data.py) ensures
every response shape and every audit-log write follows the same logic.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from models.db_models import DataRecord, FieldHistory


def record_to_response(record: DataRecord) -> dict:
    """Serialise a DataRecord to a JSON-compatible dict.

    Includes lock fields so both the user and admin views can display
    lock status without needing a separate query.
    """
    return {
        "id": record.id,
        "owner": record.owner,
        "vetter": record.vetter,
        "record_status": record.record_status,
        "last_updated": record.last_updated.isoformat() if record.last_updated else None,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "is_locked": record.is_locked,
        "locked_by": record.locked_by,
        "locked_at": record.locked_at.isoformat() if record.locked_at else None,
        "data": record.record_data or {},
    }


def log_field_changes(
    db: Session,
    record: DataRecord,
    new_data: dict,
    changed_by: str,
    now: datetime,
) -> None:
    """Compare old_data vs new_data and write a FieldHistory row for every changed field.

    The caller supplies *now* so that all changes within a single transaction
    share the same timestamp.
    """
    old_data = record.record_data or {}
    all_keys = set(old_data.keys()) | set(new_data.keys())
    for key in all_keys:
        old_val = old_data.get(key)
        new_val = new_data.get(key)
        if str(old_val) != str(new_val):
            db.add(
                FieldHistory(
                    record_id=record.id,
                    file_id=record.file_id,
                    field_name=key,
                    old_value=str(old_val) if old_val is not None else None,
                    new_value=str(new_val) if new_val is not None else None,
                    changed_by=changed_by,
                    changed_at=now,
                )
            )

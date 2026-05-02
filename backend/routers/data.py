"""
Data router — /api/* (user-facing endpoints)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, func
from sqlalchemy.orm import Session

from auth.jwt import get_current_user
from database import get_db
from models.db_models import AppConfig, AppUser, DataFile, DataRecord, FieldHistory, SchemaDefinition
from routers._helpers import log_field_changes as _log_field_changes, record_to_response as _record_to_response_base
from services.schema_parser import validate_cell

router = APIRouter(prefix="/api", tags=["data"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# All lowercase names that identify the vetting-status column.
# Includes the current name ("vetted" — boolean) and legacy names
# ("vetting status", "record vetting status") so existing workbooks
# continue to work without modification.
_VETTING_STATUS_FIELDS = {"vetted", "vetting status", "record vetting status"}


def _is_record_vetted(record: DataRecord) -> bool:
    """Return True if the record's vetting-status field is truthy.

    Handles both the new boolean form (True / "true" / "1" / "yes") and the
    legacy list form (the literal string "Vetted").
    """
    data = record.record_data or {}
    for key, value in data.items():
        if key.lower() not in _VETTING_STATUS_FIELDS:
            continue
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        s = str(value).strip().lower()
        return s in ("true", "1", "yes", "vetted")
    return False


def _normalize_date_values(data: dict) -> dict:
    """Convert all date/datetime values in data to DD/MM/YYYY or DD/MM/YYYY HH:MM:SS format.

    Handles ISO 8601 formats (YYYY-MM-DD and YYYY-MM-DDTHH:MM:SS) and converts them
    to DD/MM/YYYY format for consistency with Excel display format.
    """
    if not data:
        return data

    normalized = {}
    for key, value in data.items():
        if value is None or not isinstance(value, str):
            normalized[key] = value
            continue

        # Try to parse as ISO datetime
        if 'T' in value and ':' in value:
            try:
                dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                normalized[key] = dt.strftime("%d/%m/%Y %H:%M:%S")
                continue
            except (ValueError, AttributeError):
                pass

        # Try to parse as ISO date (YYYY-MM-DD)
        if len(value) == 10 and value.count('-') == 2:
            try:
                dt = datetime.strptime(value, "%Y-%m-%d")
                normalized[key] = dt.strftime("%d/%m/%Y")
                continue
            except ValueError:
                pass

        # Keep as-is if no format matches
        normalized[key] = value

    return normalized


def _record_to_response(record: DataRecord) -> dict:
    """Thin wrapper around the shared helper: normalises date values for display."""
    base = _record_to_response_base(record)
    base["data"] = _normalize_date_values(base["data"])
    return base


# ---------------------------------------------------------------------------
# GET /files — active file list
# ---------------------------------------------------------------------------

@router.get("/files")
def list_active_files(
    _user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    files = db.query(DataFile).filter(DataFile.is_active.is_(True)).all()
    return [
        {
            "id": f.id,
            "filename": f.filename,
            "display_name": f.display_name,
        }
        for f in files
    ]


# ---------------------------------------------------------------------------
# GET /files/{file_id}/schema
# ---------------------------------------------------------------------------

@router.get("/files/{file_id}/schema")
def get_schema(
    file_id: int,
    _user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Get the data file to include display_name in response
    data_file = db.query(DataFile).filter(DataFile.id == file_id).first()

    schemas = (
        db.query(SchemaDefinition)
        .filter(SchemaDefinition.file_id == file_id)
        .order_by(SchemaDefinition.field_order)
        .all()
    )
    return {
        "display_name": data_file.display_name if data_file else None,
        "fields": [
            {
                "id": s.id,
                "file_id": s.file_id,
                "field_name": s.field_name,
                "description": s.description,
                "data_type": s.data_type,
                "sample_data": s.sample_data,
                "depends_on": s.depends_on,
                "accept_null": s.accept_null,
                "field_order": s.field_order,
            }
            for s in schemas
        ]
    }


# ---------------------------------------------------------------------------
# GET /files/{file_id}/records — current user's records + ALL-owner records
# ---------------------------------------------------------------------------

@router.get("/files/{file_id}/records")
def get_user_records(
    file_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    userid = current_user["sub"].upper()

    records = (
        db.query(DataRecord)
        .filter(
            DataRecord.file_id == file_id,
            or_(
                # owner matches current user (case-insensitive, stored uppercase)
                # OR owner is "ALL" (shared records visible to everyone)
                DataRecord.owner.in_([userid, "ALL"]),
                # OR the current user is the assigned vetter for this record
                DataRecord.vetter == userid,
            ),
        )
        .order_by(DataRecord.id)
        .all()
    )
    return [_record_to_response(r) for r in records]


# ---------------------------------------------------------------------------
# POST /files/{file_id}/records/new — create empty record
# ---------------------------------------------------------------------------

@router.post("/files/{file_id}/records/new")
def create_new_record(
    file_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data_file = (
        db.query(DataFile)
        .filter(DataFile.id == file_id, DataFile.is_active.is_(True))
        .first()
    )
    if data_file is None:
        raise HTTPException(status_code=404, detail="File not found")

    userid = current_user["sub"].upper()
    now = datetime.now(timezone.utc)

    # Auto-assign to the vetter with the fewest records in this file
    # Get unique vetters from existing records (vetter is a system column, not in record_data)
    assigned_vetter = None

    # Query all records with assigned vetters in this file
    existing_vetters = (
        db.query(DataRecord.vetter)
        .filter(
            and_(
                DataRecord.file_id == file_id,
                DataRecord.vetter.isnot(None)
            )
        )
        .distinct()
        .all()
    )

    if existing_vetters:
        # For each vetter, count how many records they're assigned to
        vetter_counts = []
        for vetter_row in existing_vetters:
            vetter_id = vetter_row[0]
            count = db.query(func.count(DataRecord.id)).filter(
                and_(
                    DataRecord.file_id == file_id,
                    DataRecord.vetter == vetter_id
                )
            ).scalar() or 0
            vetter_counts.append((vetter_id, count))

        # Pick the vetter with the fewest records
        if vetter_counts:
            assigned_vetter = min(vetter_counts, key=lambda x: x[1])[0]
    else:
        # No vetters found in the dataset; use the admin account as the default vetter
        app_config = db.query(AppConfig).order_by(AppConfig.id.desc()).first()
        if app_config:
            admin_userid = app_config.admin_account.upper()
            admin_user = db.query(AppUser).filter(AppUser.userid == admin_userid).first()
            if admin_user:
                assigned_vetter = admin_user.userid

    record = DataRecord(
        file_id=file_id,
        owner=userid,
        vetter=assigned_vetter,
        record_data={},
        record_status="New",
        last_updated=now,
        created_at=now,
    )
    db.add(record)
    try:
        db.flush()  # assign record.id before logging history
        db.add(
            FieldHistory(
                record_id=record.id,
                file_id=file_id,
                field_name="_ROW_ADDED",
                old_value=None,
                new_value=None,
                changed_by=userid,
                changed_at=now,
            )
        )
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create record. Please try again.")
    return _record_to_response(record)


# ---------------------------------------------------------------------------
# POST /files/{file_id}/submit — validate + save changed records
# ---------------------------------------------------------------------------

@router.post("/files/{file_id}/submit")
def submit_records(
    file_id: int,
    submissions: list[dict],
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a batch of updated records.

    Each item: {id, record_status, data: {...}}

    Validates all fields against schema before persisting anything.
    Returns 422 with field-level errors on validation failure.
    """
    userid = current_user["sub"].upper()

    # Load schema once
    schemas = (
        db.query(SchemaDefinition)
        .filter(SchemaDefinition.file_id == file_id)
        .order_by(SchemaDefinition.field_order)
        .all()
    )
    schema_by_name: dict[str, SchemaDefinition] = {s.field_name: s for s in schemas}

    now = datetime.now(timezone.utc)
    field_errors: dict[str, dict[str, str]] = {}  # record_id -> {field -> error}

    # --- Validation pass ---------------------------------------------------
    # Pre-fetch records so we can determine owner/vetter roles per submission.
    record_ids = [s.get("id") for s in submissions if s.get("id") is not None]
    records_by_id: dict[int, DataRecord] = {
        r.id: r
        for r in db.query(DataRecord)
        .filter(DataRecord.id.in_(record_ids), DataRecord.file_id == file_id)
        .all()
    }

    for submission in submissions:
        record_id = submission.get("id")
        data = submission.get("data", {})

        record = records_by_id.get(record_id)
        # Determine if the current user is the vetter for this record.
        # Vetters may set the vetting status; owners may not — so skip vetting
        # status validation for owners (the backend will preserve the stored value).
        is_vetter = (
            record is not None
            and bool(record.vetter)
            and record.vetter.upper() == userid
        )

        # Vetted-lock: once the vetter marks the record as vetted, the owner
        # may no longer submit changes. Only the vetter (who can also unset
        # `vetted`) can edit a vetted record.
        if record is not None and not is_vetter and _is_record_vetted(record):
            field_errors[str(record_id)] = {
                "_record": (
                    "This record has been marked as vetted by the vetter and is "
                    "now locked. Ask the vetter to unset 'Vetted' before editing."
                )
            }
            continue

        # Validate each field
        errors_for_record: dict[str, str] = {}
        for field_name, schema_def in schema_by_name.items():
            # Skip vetting status validation when the submitter is not the vetter —
            # the backend will restore the existing value, so the submitted one is ignored.
            if field_name.lower() in _VETTING_STATUS_FIELDS and not is_vetter:
                continue
            value = data.get(field_name)
            error = validate_cell(value, schema_def, data)
            if error:
                errors_for_record[field_name] = error

        if errors_for_record:
            field_errors[str(record_id)] = errors_for_record

    if field_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Validation failed", "errors": field_errors},
        )

    # --- Persist pass -------------------------------------------------------
    # Fields that live as proper DB columns, not inside record_data JSONB.
    # Strip them from data submissions to prevent stale values in JSONB.
    _SYSTEM_DATA_FIELDS = {"owner", "vetter", "record vetter", "last updated"}

    saved = 0
    saved_record_ids = []  # Track which records were successfully saved for unlocking

    for submission in submissions:
        record_id = submission.get("id")
        if record_id is None:
            continue

        record = records_by_id.get(record_id)
        if record is None:
            continue

        # Determine access: user must be the owner or an assigned vetter.
        user_is_owner = record.owner in (userid, "ALL")
        user_is_vetter = bool(record.vetter) and record.vetter.upper() == userid
        if not user_is_owner and not user_is_vetter:
            continue

        new_data = dict(submission.get("data", {}))

        # Strip system-managed fields from the JSONB blob regardless of who submits.
        # These are stored as proper DB columns and must not be overwritten via data.
        new_data = {k: v for k, v in new_data.items()
                    if k.lower() not in _SYSTEM_DATA_FIELDS}

        # Only the assigned vetter may change the vetting status field.
        # If the submitter is NOT the vetter, silently preserve the existing value.
        if not user_is_vetter:
            existing_vetting = (record.record_data or {}).get(
                next((k for k in (record.record_data or {})
                      if k.lower() in _VETTING_STATUS_FIELDS), None)
            )
            # Remove any vetting-status key the owner might have submitted, then
            # restore the current DB value (if one exists) so it is not lost.
            new_data = {k: v for k, v in new_data.items()
                        if k.lower() not in _VETTING_STATUS_FIELDS}
            if existing_vetting is not None:
                # Find the canonical key name stored in DB and re-insert it
                canonical_key = next(
                    (k for k in (record.record_data or {})
                     if k.lower() in _VETTING_STATUS_FIELDS),
                    None,
                )
                if canonical_key:
                    new_data[canonical_key] = existing_vetting

        _log_field_changes(db, record, new_data, userid, now)

        record.record_data = new_data
        old_status = record.record_status
        new_status = submission.get("record_status")
        if new_status:
            record.record_status = new_status
        elif record.record_status in ("Unvetted", "New"):
            record.record_status = "Updated"
        if record.record_status != old_status:
            db.add(FieldHistory(
                record_id=record.id,
                file_id=record.file_id,
                field_name="Record Status",
                old_value=old_status,
                new_value=record.record_status,
                changed_by=userid,
                changed_at=now,
            ))
        record.last_updated = now
        saved += 1
        saved_record_ids.append(record.id)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save records. Please try again.")

    # Unlock records after successful submission.
    # Re-query to avoid using stale in-memory objects from before the commit.
    if saved_record_ids:
        try:
            db.query(DataRecord).filter(
                DataRecord.id.in_(saved_record_ids),
                DataRecord.is_locked.is_(True),
                DataRecord.locked_by == userid,
            ).update(
                {"is_locked": False, "locked_by": None, "locked_at": None},
                synchronize_session=False,
            )
            db.commit()
        except Exception:
            db.rollback()
            # Non-fatal — data is saved; only unlock failed

    return {"ok": True, "saved": saved}


# ---------------------------------------------------------------------------
# GET /files/{file_id}/records/{record_id}/history/{field_name}
# ---------------------------------------------------------------------------

@router.get("/files/{file_id}/records/{record_id}/history/{field_name}")
def get_field_history(
    file_id: int,
    record_id: int,
    field_name: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify record belongs to user
    record = (
        db.query(DataRecord)
        .filter(DataRecord.id == record_id, DataRecord.file_id == file_id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")

    userid = current_user["sub"].upper()
    user_is_owner = record.owner in (userid, "ALL")
    user_is_vetter = bool(record.vetter) and record.vetter.upper() == userid
    if not user_is_owner and not user_is_vetter:
        raise HTTPException(status_code=403, detail="Access denied")

    history = (
        db.query(FieldHistory)
        .filter(
            FieldHistory.record_id == record_id,
            FieldHistory.file_id == file_id,
            FieldHistory.field_name == field_name,
        )
        .order_by(FieldHistory.changed_at.desc())
        .all()
    )

    # Resolve userids to display names in one query (AppUser imported at module level)
    userids = list({h.changed_by for h in history if h.changed_by})
    name_map: dict[str, str] = {}
    if userids:
        rows = db.query(AppUser.userid, AppUser.name).filter(AppUser.userid.in_(userids)).all()
        name_map = {r.userid: r.name for r in rows}

    return [
        {
            "id": h.id,
            "record_id": h.record_id,
            "file_id": h.file_id,
            "field_name": h.field_name,
            "old_value": h.old_value,
            "new_value": h.new_value,
            "changed_by": h.changed_by,
            "changed_by_name": name_map.get(h.changed_by, h.changed_by),
            "changed_at": h.changed_at.isoformat() if h.changed_at else None,
        }
        for h in history
    ]


# ---------------------------------------------------------------------------
# Record Locking Endpoints
# ---------------------------------------------------------------------------


@router.post("/files/{file_id}/records/{record_id}/lock")
def lock_record(
    file_id: int,
    record_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lock a record for the current user to prevent concurrent edits.

    Returns:
        - 200: Record locked (or already locked by this user)
        - 409: Record locked by another user
        - 404: Record not found
    """
    # Use SELECT ... FOR UPDATE to prevent concurrent lock acquisition (row-level lock)
    record = (
        db.query(DataRecord)
        .filter(DataRecord.id == record_id, DataRecord.file_id == file_id)
        .with_for_update()
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    userid = user["sub"].upper()

    # Check permissions: user must be owner or vetter
    user_is_owner = record.owner in (userid, "ALL")
    user_is_vetter = bool(record.vetter) and record.vetter.upper() == userid
    if not user_is_owner and not user_is_vetter:
        raise HTTPException(status_code=403, detail="You don't have permission to lock this record")

    # Vetted-lock: owners cannot lock (and therefore cannot edit) a record that
    # the vetter has already marked as vetted. The vetter must unset 'Vetted' first.
    if user_is_owner and not user_is_vetter and _is_record_vetted(record):
        raise HTTPException(
            status_code=423,
            detail="This record has been marked as vetted and is locked. Ask the vetter to unset 'Vetted' before editing.",
        )

    # If already locked by another user, return conflict
    if record.is_locked and record.locked_by and record.locked_by.upper() != userid:
        raise HTTPException(
            status_code=409,
            detail=f"Record is locked by {record.locked_by}",
            headers={"X-Locked-By": record.locked_by},
        )

    # Lock the record (atomic — held under FOR UPDATE row lock until commit)
    record.is_locked = True
    record.locked_by = userid
    record.locked_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to lock record. Please try again.")

    return {"ok": True, "locked_by": userid}


@router.post("/files/{file_id}/records/{record_id}/unlock")
def unlock_record(
    file_id: int,
    record_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Unlock a record. Only the user who locked it can unlock (or admins).

    Returns:
        - 200: Record unlocked
        - 403: User is not the locker
        - 404: Record not found
    """
    record = (
        db.query(DataRecord)
        .filter(DataRecord.id == record_id, DataRecord.file_id == file_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    userid = user["sub"].upper()

    # Only the locker can unlock (or we could allow admins in the future)
    if record.locked_by and record.locked_by.upper() != userid:
        raise HTTPException(
            status_code=403,
            detail="Only the user who locked this record can unlock it",
        )

    # Unlock the record
    record.is_locked = False
    record.locked_by = None
    record.locked_at = None
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to unlock record. Please try again.")

    return {"ok": True}


@router.get("/files/{file_id}/locks")
def get_file_locks(
    file_id: int,
    _user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get all locked records in a file with lock information.

    Returns:
        - Array of locked records with: id, locked_by, locked_at
    """
    locked_records = (
        db.query(DataRecord)
        .filter(
            DataRecord.file_id == file_id,
            DataRecord.is_locked == True,
        )
        .all()
    )

    return [
        {
            "id": r.id,
            "locked_by": r.locked_by,
            "locked_at": r.locked_at.isoformat() if r.locked_at else None,
            "is_vetted": _is_record_vetted(r),
            "vetter": r.vetter,
        }
        for r in locked_records
    ]


@router.delete("/files/{file_id}/records/{record_id}")
def delete_record(
    file_id: int,
    record_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete a record. Only the assigned vetter can delete a record.

    Returns:
        - 200: Record deleted
        - 403: User is not the assigned vetter
        - 404: Record not found
    """
    record = (
        db.query(DataRecord)
        .filter(DataRecord.id == record_id, DataRecord.file_id == file_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    userid = current_user["sub"].upper()

    # Only the assigned vetter can delete the record
    if not record.vetter:
        raise HTTPException(
            status_code=403,
            detail="This record has no assigned vetter. Only the assigned vetter can delete a record.",
        )

    vetter_upper = record.vetter.strip().upper() if record.vetter else None
    if vetter_upper != userid:
        raise HTTPException(
            status_code=403,
            detail="You may only delete records assigned to you as a vetter.",
        )

    # Log a deletion event before removing the record.
    # record_id is set to None because the record will be gone after commit;
    # the original record ID is stored in old_value for reference in the history export.
    db.add(
        FieldHistory(
            record_id=None,
            file_id=file_id,
            field_name="_ROW_DELETED",
            old_value=str(record.id),
            new_value=None,
            changed_by=userid,
            changed_at=datetime.now(timezone.utc),
        )
    )
    db.delete(record)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete record. Please try again.")

    return {"ok": True, "deleted_record_id": record_id}

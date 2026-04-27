"""
Admin router — /api/admin/*
"""

import csv
import io
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import yaml
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from passlib.context import CryptContext
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth.jwt import create_access_token, get_current_admin
from database import get_db
from models.db_models import (
    AppConfig,
    AppUser,
    DataFile,
    DataRecord,
    FieldHistory,
    SchemaDefinition,
)
from services.excel_service import export_excel, parse_excel
from services.schema_parser import parse_data_type

router = APIRouter(prefix="/api/admin", tags=["admin"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REQUIRED_YAML_KEYS = {"title", "admin_account", "admin_pass"}


def _validate_yaml(content: bytes) -> dict:
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The configuration file contains invalid YAML syntax. "
                f"Common causes: incorrect indentation (use spaces, not tabs), "
                f"missing quotes around values that contain special characters (: [ ] {{ }}), "
                f"or a stray colon in a value. "
                f"Error detail: {exc}"
            ),
        )
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=400,
            detail=(
                "The configuration file must be a YAML mapping (key: value pairs). "
                "It should look like this:\n"
                "  title: \"My Instance\"\n"
                "  admin_account: \"admin\"\n"
                "  admin_pass: \"secret\"\n"
                "  users_file: \"users.csv\"\n"
                "  backup_dir: \"./backups\"\n"
                "Make sure the file does not start with a list (-) or a plain value."
            ),
        )
    missing = REQUIRED_YAML_KEYS - data.keys()
    if missing:
        pretty = ", ".join(f"'{k}'" for k in sorted(missing))
        raise HTTPException(
            status_code=400,
            detail=(
                f"The configuration file is missing required key(s): {pretty}. "
                f"Your config.yaml must include all of the following:\n"
                f"  title: \"Your instance title\"\n"
                f"  admin_account: \"admin_username\"\n"
                f"  admin_pass: \"admin_password\"\n"
                f"  users_file: \"users.csv\"\n"
                f"  backup_dir: \"./backups\"\n"
                f"Optional: auto_logout_minutes: 30 (default: 30, range: 1-480)"
            ),
        )

    # Validate optional auto_logout_minutes
    if "auto_logout_minutes" in data:
        logout_mins = data["auto_logout_minutes"]
        if not isinstance(logout_mins, int) or logout_mins < 1 or logout_mins > 480:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"auto_logout_minutes must be an integer between 1 and 480 (minutes). "
                    f"Got: {logout_mins}. This controls the session inactivity timeout."
                ),
            )
    else:
        # Set default if not specified
        data["auto_logout_minutes"] = 30

    return data


def _parse_users_csv(content: bytes) -> list[dict]:
    """
    Parse a users CSV file.  Required columns: userid, name, password.
    Returns list of dicts with keys: userid (uppercased), name, password.
    """
    text = content.decode("utf-8-sig").strip()
    reader = csv.DictReader(io.StringIO(text))
    fieldnames_lower = [f.lower() for f in (reader.fieldnames or [])]
    required = {"userid", "name", "password"}
    missing = required - set(fieldnames_lower)
    if missing:
        pretty = ", ".join(f"'{c}'" for c in sorted(missing))
        found = ", ".join(f"'{f}'" for f in (reader.fieldnames or [])) or "(none detected)"
        raise HTTPException(
            status_code=400,
            detail=(
                f"The users CSV is missing required column(s): {pretty}. "
                f"Column(s) found in the file: {found}. "
                f"The first row of the CSV must be exactly:\n"
                f"  userid,name,password\n"
                f"Example rows:\n"
                f"  Z1234,Jane Smith,abc123\n"
                f"  Z5678,John Doe,xyz789\n"
                f"Note: column names are case-insensitive but must match exactly (no extra spaces)."
            ),
        )

    users = []
    skipped = 0
    for row in reader:
        row_lower = {k.lower(): v for k, v in row.items()}
        uid = (row_lower.get("userid") or "").strip()
        name = (row_lower.get("name") or "").strip()
        pwd = (row_lower.get("password") or "").strip()
        if uid:
            users.append({"userid": uid.upper(), "name": name, "password": pwd})
        else:
            skipped += 1

    if not users:
        raise HTTPException(
            status_code=400,
            detail=(
                "The users CSV contains no valid user rows. "
                "Check that the file has data rows beneath the header row, "
                "and that the 'userid' column is not empty."
            ),
        )
    return users


def _record_to_response(record: DataRecord) -> dict:
    return {
        "id": record.id,
        "owner": record.owner,
        "vetter": record.vetter,
        "record_status": record.record_status,
        "last_updated": record.last_updated.isoformat() if record.last_updated else None,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "data": record.record_data or {},
    }


def _log_field_changes(
    db: Session,
    record: DataRecord,
    new_data: dict,
    changed_by: str,
):
    """Compare old_data vs new_data and write FieldHistory rows for every change."""
    old_data = record.record_data or {}
    all_keys = set(old_data.keys()) | set(new_data.keys())
    now = datetime.now(timezone.utc)
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


# ---------------------------------------------------------------------------
# GET /status — no auth
# ---------------------------------------------------------------------------

@router.get("/status")
def get_status(db: Session = Depends(get_db)):
    configured = db.query(AppConfig).first() is not None
    return {"configured": configured}


# ---------------------------------------------------------------------------
# POST /setup — no auth
# ---------------------------------------------------------------------------

@router.post("/setup")
async def setup(
    yaml_file: UploadFile = File(...),
    users_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Only allow setup once
    if db.query(AppConfig).first() is not None:
        raise HTTPException(status_code=400, detail="Application is already configured.")

    yaml_content = await yaml_file.read()
    config_data = _validate_yaml(yaml_content)

    users_content = await users_file.read()
    users = _parse_users_csv(users_content)

    # Save users file to disk
    users_dir = os.getenv("USERS_FILE_DIR", "/data/users")
    os.makedirs(users_dir, exist_ok=True)
    users_file_path = os.path.join(users_dir, "users.csv")
    with open(users_file_path, "wb") as fh:
        fh.write(users_content)

    backup_dir = os.getenv("BACKUP_DIR", "/data/backups")

    admin_pass_hash = pwd_context.hash(str(config_data["admin_pass"]))

    app_config = AppConfig(
        title=str(config_data["title"]),
        admin_account=str(config_data["admin_account"]),
        admin_pass_hash=admin_pass_hash,
        users_file_path=users_file_path,
        backup_dir=backup_dir,
    )
    db.add(app_config)

    # Create/replace all app users
    db.query(AppUser).delete()
    for u in users:
        pwd_hash = pwd_context.hash(u["password"]) if u["password"] else pwd_context.hash("")
        db.add(AppUser(userid=u["userid"], name=u["name"], password_hash=pwd_hash))

    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# POST /login — no auth
# ---------------------------------------------------------------------------

@router.post("/login")
async def admin_login(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    config = db.query(AppConfig).first()
    if config is None:
        raise HTTPException(status_code=503, detail="not_configured")

    if username != config.admin_account or not pwd_context.verify(
        password, config.admin_pass_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
        )

    token = create_access_token(
        data={"sub": username.upper(), "scope": "admin"},
        expires_delta=timedelta(hours=8),
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "title": config.title,
    }


# ---------------------------------------------------------------------------
# GET /config — admin auth
# ---------------------------------------------------------------------------

@router.get("/config")
def get_config(
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    config = db.query(AppConfig).first()
    if config is None:
        raise HTTPException(status_code=404, detail="Not configured")
    return {
        "id": config.id,
        "title": config.title,
        "admin_account": config.admin_account,
        "users_file_path": config.users_file_path,
        "backup_dir": config.backup_dir,
        "auto_logout_minutes": config.auto_logout_minutes,
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


# ---------------------------------------------------------------------------
# POST /config/yaml — update configuration YAML only (admin auth)
# ---------------------------------------------------------------------------

@router.post("/config/yaml")
async def update_config_yaml(
    yaml_file: UploadFile = File(...),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Update the application configuration (title, admin credentials) from a YAML file."""
    config = db.query(AppConfig).first()
    if config is None:
        raise HTTPException(status_code=404, detail="Not configured")

    yaml_content = await yaml_file.read()
    config_data = _validate_yaml(yaml_content)

    config.title = str(config_data["title"])
    config.admin_account = str(config_data["admin_account"])
    config.admin_pass_hash = pwd_context.hash(str(config_data["admin_pass"]))
    if "auto_logout_minutes" in config_data:
        config.auto_logout_minutes = config_data["auto_logout_minutes"]

    db.commit()

    # Reload to get updated timestamps
    db.refresh(config)
    return {
        "ok": True,
        "title": config.title,
        "admin_account": config.admin_account,
        "auto_logout_minutes": config.auto_logout_minutes,
    }


# ---------------------------------------------------------------------------
# POST /config/users — update users CSV only (admin auth)
# ---------------------------------------------------------------------------

@router.post("/config/users")
async def update_config_users(
    users_file: UploadFile = File(...),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Replace all application users from a CSV file."""
    config = db.query(AppConfig).first()
    if config is None:
        raise HTTPException(status_code=404, detail="Not configured")

    users_content = await users_file.read()
    users = _parse_users_csv(users_content)

    # Persist updated users file to disk
    users_file_path = config.users_file_path or "/data/users/users.csv"
    users_dir = os.path.dirname(users_file_path)
    os.makedirs(users_dir, exist_ok=True)
    with open(users_file_path, "wb") as fh:
        fh.write(users_content)

    # Replace all user records
    db.query(AppUser).delete()
    for u in users:
        pwd_hash = pwd_context.hash(u["password"]) if u["password"] else pwd_context.hash("")
        db.add(AppUser(userid=u["userid"], name=u["name"], password_hash=pwd_hash))

    db.commit()
    return {"ok": True, "user_count": len(users)}


# ---------------------------------------------------------------------------
# POST /config — kept for backwards compatibility (admin auth)
# ---------------------------------------------------------------------------

@router.post("/config")
async def update_config(
    yaml_file: UploadFile = File(...),
    users_file: Optional[UploadFile] = File(None),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    config = db.query(AppConfig).first()
    if config is None:
        raise HTTPException(status_code=404, detail="Not configured")

    yaml_content = await yaml_file.read()
    config_data = _validate_yaml(yaml_content)

    config.title = str(config_data["title"])
    config.admin_account = str(config_data["admin_account"])
    config.admin_pass_hash = pwd_context.hash(str(config_data["admin_pass"]))

    if users_file is not None:
        users_content = await users_file.read()
        users = _parse_users_csv(users_content)

        users_dir = os.path.dirname(config.users_file_path or "/data/users/users.csv")
        os.makedirs(users_dir, exist_ok=True)
        with open(config.users_file_path or os.path.join(users_dir, "users.csv"), "wb") as fh:
            fh.write(users_content)

        db.query(AppUser).delete()
        for u in users:
            pwd_hash = pwd_context.hash(u["password"]) if u["password"] else pwd_context.hash("")
            db.add(AppUser(userid=u["userid"], name=u["name"], password_hash=pwd_hash))

    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# GET /files — admin auth
# ---------------------------------------------------------------------------

@router.get("/files")
def list_files(
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    files = db.query(DataFile).filter(DataFile.is_active.is_(True)).all()
    result = []
    for f in files:
        count = (
            db.query(func.count(DataRecord.id))
            .filter(DataRecord.file_id == f.id)
            .scalar()
        )
        result.append(
            {
                "id": f.id,
                "filename": f.filename,
                "display_name": f.display_name,
                "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
                "is_active": f.is_active,
                "record_count": count,
            }
        )
    return result


# ---------------------------------------------------------------------------
# POST /files/upload — admin auth
# ---------------------------------------------------------------------------

@router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    file_bytes = await file.read()
    filename = file.filename or "upload.xlsx"

    try:
        data_rows, schema_list = parse_excel(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Derive display name from filename (strip extension)
    display_name = re.sub(r"\.[^.]+$", "", filename).strip() or filename

    data_file = DataFile(filename=filename, display_name=display_name)
    db.add(data_file)
    db.flush()  # get data_file.id

    # Persist schema definitions, excluding system columns.
    # Owner, Vetter, Last Updated, and Record Status are managed by dedicated DB
    # columns; storing them as SchemaDefinitions would cause duplicate grid columns.
    _SYSTEM_COLS = {"owner", "vetter", "record vetter", "last updated", "record status"}
    for s in schema_list:
        if s["field_name"].lower() in _SYSTEM_COLS:
            continue
        db.add(
            SchemaDefinition(
                file_id=data_file.id,
                field_name=s["field_name"],
                description=s["description"],
                data_type=s["data_type"],
                sample_data=s["sample_data"],
                depends_on=s["depends_on"],
                accept_null=s["accept_null"],
                field_order=s["field_order"],
            )
        )

    # Persist data records
    now = datetime.now(timezone.utc)
    record_count = 0
    for row in data_rows:
        # Extract system columns (case-insensitive key match)
        row_lower = {k.lower(): v for k, v in row.items()}
        owner = str(row_lower.get("owner") or "ALL").strip().upper()
        # Vetter: stored uppercase like owner; check "record vetter" field; None if not present in the row
        vetter_raw = row_lower.get("record vetter") or row_lower.get("vetter")
        vetter = str(vetter_raw).strip().upper() if vetter_raw else None
        last_updated_raw = row_lower.get("last updated")
        record_status_raw = row_lower.get("record status")
        record_status = str(record_status_raw).strip() if record_status_raw else "Unvetted"

        # Parse last_updated
        last_updated = now
        if last_updated_raw:
            lu_str = str(last_updated_raw).strip()
            for fmt in ("%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y"):
                try:
                    last_updated = datetime.strptime(lu_str, fmt).replace(tzinfo=timezone.utc)
                    break
                except ValueError:
                    pass

        # Build record_data from schema fields only, excluding system columns.
        # Owner, Vetter, Last Updated, Record Status are held in dedicated DB
        # columns and must not also live in the JSONB blob.
        _SYSTEM = {"owner", "vetter", "record vetter", "last updated", "record status"}
        schema_field_names = {
            s["field_name"] for s in schema_list
            if s["field_name"].lower() not in _SYSTEM
        }
        record_data: dict[str, Any] = {}
        for field_name in schema_field_names:
            # Find matching column (case-insensitive)
            matched_val = None
            for col_name, col_val in row.items():
                if col_name.lower() == field_name.lower():
                    matched_val = col_val
                    break
            record_data[field_name] = matched_val

        db.add(
            DataRecord(
                file_id=data_file.id,
                owner=owner,
                vetter=vetter,
                record_data=record_data,
                record_status=record_status,
                last_updated=last_updated,
                created_at=now,
            )
        )
        record_count += 1

    db.commit()
    return {
        "id": data_file.id,
        "filename": data_file.filename,
        "display_name": data_file.display_name,
        "record_count": record_count,
    }


# ---------------------------------------------------------------------------
# DELETE /files/{file_id} — admin auth
# ---------------------------------------------------------------------------

@router.delete("/files/{file_id}")
def deactivate_file(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    data_file = db.query(DataFile).filter(DataFile.id == file_id).first()
    if data_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    data_file.is_active = False
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# GET /files/{file_id}/download — admin auth
# ---------------------------------------------------------------------------

@router.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    data_file = db.query(DataFile).filter(DataFile.id == file_id).first()
    if data_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        xlsx_bytes = export_excel(file_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    safe_name = re.sub(r"[^\w\-. ]", "_", data_file.display_name)
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'},
    )


# ---------------------------------------------------------------------------
# GET /files/{file_id}/schema — admin auth
# ---------------------------------------------------------------------------

@router.get("/files/{file_id}/schema")
def get_schema(
    file_id: int,
    _admin=Depends(get_current_admin),
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
# GET /files/{file_id}/records — admin auth (ALL records)
# ---------------------------------------------------------------------------

@router.get("/files/{file_id}/records")
def get_all_records(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    records = (
        db.query(DataRecord)
        .filter(DataRecord.file_id == file_id)
        .order_by(DataRecord.id)
        .all()
    )
    return [_record_to_response(r) for r in records]


# ---------------------------------------------------------------------------
# PUT /files/{file_id}/records — admin auth — batch update
# ---------------------------------------------------------------------------

@router.put("/files/{file_id}/records")
def batch_update_records(
    file_id: int,
    updates: list[dict],
    _admin: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    changed_by = _admin.get("sub", "admin")
    now = datetime.now(timezone.utc)
    updated_ids = []

    for update in updates:
        record_id = update.get("id")
        if record_id is None:
            continue
        record = (
            db.query(DataRecord)
            .filter(DataRecord.id == record_id, DataRecord.file_id == file_id)
            .first()
        )
        if record is None:
            continue

        new_data = update.get("data", {})
        _log_field_changes(db, record, new_data, changed_by)

        record.record_data = new_data
        if "record_status" in update:
            record.record_status = update["record_status"]
        if "owner" in update:
            record.owner = str(update["owner"]).upper()
        # Handle both "vetter" and "record vetter" field names
        vetter_update = update.get("record vetter") or update.get("vetter")
        if vetter_update is not None:
            record.vetter = str(vetter_update).strip().upper() if vetter_update else None
        record.last_updated = now
        updated_ids.append(record_id)

    db.commit()
    return {"ok": True, "updated": len(updated_ids)}


# ---------------------------------------------------------------------------
# GET /files/{file_id}/records/{record_id}/history/{field_name} — admin auth
# ---------------------------------------------------------------------------

@router.get("/files/{file_id}/records/{record_id}/history/{field_name}")
def get_field_history_admin(
    file_id: int,
    record_id: int,
    field_name: str,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
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

    # Resolve userids to display names in one query
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
# Report helpers
# ---------------------------------------------------------------------------

def _get_by_user_data(file_id: int, db: Session) -> list[dict]:
    """Records grouped by userid (owner), showing updated/added counts."""
    records = (
        db.query(DataRecord)
        .filter(DataRecord.file_id == file_id)
        .all()
    )
    groups: dict[str, dict] = {}
    for r in records:
        uid = r.owner
        if uid not in groups:
            groups[uid] = {"owner": uid, "total": 0, "new": 0, "updated": 0,
                           "unvetted": 0, "archived": 0}
        groups[uid]["total"] += 1
        status_lower = (r.record_status or "").lower()
        if status_lower == "new":
            groups[uid]["new"] += 1
        elif status_lower == "updated":
            groups[uid]["updated"] += 1
        elif status_lower == "unvetted":
            groups[uid]["unvetted"] += 1
        elif status_lower == "archived":
            groups[uid]["archived"] += 1
    return list(groups.values())


def _get_by_record_data(file_id: int, db: Session) -> list[dict]:
    """Records with their full field history summary."""
    records = (
        db.query(DataRecord)
        .filter(DataRecord.file_id == file_id)
        .order_by(DataRecord.id)
        .all()
    )
    result = []
    for r in records:
        history_count = (
            db.query(func.count(FieldHistory.id))
            .filter(FieldHistory.record_id == r.id)
            .scalar()
        )
        result.append(
            {
                "id": r.id,
                "owner": r.owner,
                "record_status": r.record_status,
                "last_updated": r.last_updated.isoformat() if r.last_updated else None,
                "field_changes": history_count,
            }
        )
    return result


def _get_untouched_data(file_id: int, db: Session) -> list[dict]:
    """Unvetted records grouped by userid."""
    records = (
        db.query(DataRecord)
        .filter(
            DataRecord.file_id == file_id,
            DataRecord.record_status == "Unvetted",
        )
        .all()
    )
    groups: dict[str, int] = {}
    for r in records:
        groups[r.owner] = groups.get(r.owner, 0) + 1
    return [{"owner": uid, "unvetted_count": cnt} for uid, cnt in groups.items()]


def _build_report_xlsx(headers: list[str], rows: list[list]) -> bytes:
    """Build a simple single-sheet Excel report."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Report"

    header_font = Font(bold=True)
    header_fill = PatternFill("solid", fgColor="D9E1F2")

    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        ws.column_dimensions[get_column_letter(col_idx)].width = max(15, len(h) + 4)

    for row_idx, row in enumerate(rows, start=2):
        for col_idx, val in enumerate(row, start=1):
            ws.cell(row=row_idx, column=col_idx, value=val)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# GET /reports/{file_id}/by-user — admin auth
# ---------------------------------------------------------------------------

@router.get("/reports/{file_id}/by-user")
def report_by_user(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return _get_by_user_data(file_id, db)


@router.get("/reports/{file_id}/by-user/download")
def report_by_user_download(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    data = _get_by_user_data(file_id, db)
    headers = ["Owner", "Total", "New", "Updated", "Old", "Delete"]
    rows = [
        [d["owner"], d["total"], d["new"], d["updated"], d["unvetted"], d["archived"]]
        for d in data
    ]
    xlsx_bytes = _build_report_xlsx(headers, rows)
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="report_by_user.xlsx"'},
    )


# ---------------------------------------------------------------------------
# GET /reports/{file_id}/by-record — admin auth
# ---------------------------------------------------------------------------

@router.get("/reports/{file_id}/by-record")
def report_by_record(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return _get_by_record_data(file_id, db)


@router.get("/reports/{file_id}/by-record/download")
def report_by_record_download(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    data = _get_by_record_data(file_id, db)
    headers = ["ID", "Owner", "Record Status", "Last Updated", "Field Changes"]
    rows = [
        [d["id"], d["owner"], d["record_status"], d["last_updated"], d["field_changes"]]
        for d in data
    ]
    xlsx_bytes = _build_report_xlsx(headers, rows)
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="report_by_record.xlsx"'},
    )


# ---------------------------------------------------------------------------
# GET /reports/{file_id}/untouched — admin auth
# ---------------------------------------------------------------------------

@router.get("/reports/{file_id}/untouched")
def report_untouched(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return _get_untouched_data(file_id, db)


@router.get("/reports/{file_id}/untouched/download")
def report_untouched_download(
    file_id: int,
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    data = _get_untouched_data(file_id, db)
    headers = ["Owner", "Unvetted Count"]
    rows = [[d["owner"], d["unvetted_count"]] for d in data]
    xlsx_bytes = _build_report_xlsx(headers, rows)
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="report_untouched.xlsx"'},
    )

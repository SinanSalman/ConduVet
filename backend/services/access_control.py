"""
Record visibility and user-profile helpers.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from models.db_models import AppUser, DataRecord


def normalize_tag(value: str | None, default: str = "ALL") -> str:
    text = str(value).strip().upper() if value is not None else ""
    return text or default


def normalize_role(value: str | None) -> str:
    text = str(value).strip().lower() if value is not None else ""
    return "Vetter" if text == "vetter" else "Normal"


def is_record_vetted(record: DataRecord) -> bool:
    """Check if a record has been vetted (marked as Vetted=true).

    Vetting field can be named: 'Vetted', 'Vetting Status', 'Record Vetting Status' (case-insensitive).
    Checks record_data for any field matching these names with a truthy value.
    """
    vetting_field_names = {'vetted', 'vetting status', 'record vetting status'}
    record_data = record.record_data or {}

    # Check each possible vetting field name (case-insensitive)
    for field_name, field_value in record_data.items():
        if field_name.lower() in vetting_field_names:
            # Convert to boolean-like check: true if value is truthy
            if isinstance(field_value, bool):
                return field_value
            elif isinstance(field_value, str):
                return field_value.lower() in {'true', 'yes', 'vetted'}
            elif field_value:
                return True
    return False


def get_user_profile(db: Session, userid: str) -> AppUser | None:
    return db.query(AppUser).filter(AppUser.userid == userid.upper()).first()


def get_user_group(db: Session, userid: str) -> str:
    user = get_user_profile(db, userid)
    return normalize_tag(user.group_name if user else None)


def get_user_role(db: Session, userid: str) -> str:
    user = get_user_profile(db, userid)
    return normalize_role(user.role if user else None)


def get_user_email(db: Session, userid: str) -> str | None:
    user = get_user_profile(db, userid)
    if user is None:
        return None
    email = (user.email or "").strip()
    return email or None


def record_visible_to_user(
    record: DataRecord,
    userid: str,
    user_group: str,
    user_role: str = "Normal",
    is_admin: bool = False,
) -> bool:
    if is_admin:
        return True

    user_id = normalize_tag(userid)
    owner = normalize_tag(record.owner)
    group_name = normalize_tag(record.group_name)
    group_tag = normalize_tag(user_group)
    role = normalize_role(user_role)

    if owner in (user_id, "ALL"):
        return True
    if role == "Vetter" and group_name in (group_tag, "ALL"):
        return True
    return False


def user_can_vet_record(
    record: DataRecord,
    userid: str,
    user_group: str,
    user_role: str = "Normal",
    is_admin: bool = False,
) -> bool:
    if is_admin:
        return True
    if normalize_role(user_role) != "Vetter":
        return False
    group_name = normalize_tag(record.group_name)
    group_tag = normalize_tag(user_group)
    return group_name in (group_tag, "ALL")


def user_can_delete_record(
    record: DataRecord,
    userid: str,
    user_group: str,
    user_role: str = "Normal",
    is_admin: bool = False,
) -> bool:
    if is_admin:
        return True
    # Owners can delete their own records only if not vetted yet
    if normalize_tag(record.owner) == normalize_tag(userid):
        return not is_record_vetted(record)
    # Vetters can delete records in their group
    return user_can_vet_record(record, userid, user_group, user_role)


def user_can_edit_record(
    record: DataRecord,
    userid: str,
    user_group: str,
    user_role: str = "Normal",
    is_admin: bool = False,
) -> bool:
    if is_admin:
        return True
    return record_visible_to_user(record, userid, user_group, user_role) or user_can_vet_record(
        record, userid, user_group, user_role, is_admin=False
    )

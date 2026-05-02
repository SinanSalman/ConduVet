from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Integer, String, Boolean, DateTime, ForeignKey, Text, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class AppConfig(Base):
    __tablename__ = "app_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    admin_account: Mapped[str] = mapped_column(String(255), nullable=False)
    admin_pass_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    users_file_path: Mapped[str] = mapped_column(String(1024), nullable=True)
    backup_dir: Mapped[str] = mapped_column(String(1024), nullable=True)
    auto_logout_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AppUser(Base):
    __tablename__ = "app_users"

    # stored uppercase for case-insensitive match
    userid: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class DataFile(Base):
    __tablename__ = "data_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    display_name: Mapped[str] = mapped_column(String(512), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    schema_definitions: Mapped[list["SchemaDefinition"]] = relationship(
        "SchemaDefinition", back_populates="data_file", cascade="all, delete-orphan"
    )
    data_records: Mapped[list["DataRecord"]] = relationship(
        "DataRecord", back_populates="data_file", cascade="all, delete-orphan"
    )


class SchemaDefinition(Base):
    __tablename__ = "schema_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    file_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_files.id"), nullable=False, index=True
    )
    field_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    data_type: Mapped[str] = mapped_column(String(512), nullable=False)
    sample_data: Mapped[str] = mapped_column(Text, nullable=True)
    depends_on: Mapped[str] = mapped_column(Text, nullable=True)
    accept_null: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    field_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    data_file: Mapped["DataFile"] = relationship(
        "DataFile", back_populates="schema_definitions"
    )


class DataRecord(Base):
    __tablename__ = "data_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    file_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_files.id"), nullable=False, index=True
    )
    owner: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # vetter holds the userid of the person who can vet this record (change
    # Record Vetting Status).  Null means no vetter is assigned.
    vetter: Mapped[str] = mapped_column(String(255), nullable=True, index=True)
    record_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    record_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="New"
    )  # New, Updated, Old, Delete
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Record locking for concurrent edit prevention
    is_locked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )
    locked_by: Mapped[str] = mapped_column(String(255), nullable=True, index=True)
    locked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    data_file: Mapped["DataFile"] = relationship(
        "DataFile", back_populates="data_records"
    )
    # Note: no ORM cascade to FieldHistory — the DB FK uses ON DELETE SET NULL,
    # so history rows are preserved (with record_id=NULL) when a record is deleted.


class FieldHistory(Base):
    __tablename__ = "field_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Nullable so that deletion-event rows survive after the record is removed.
    # ON DELETE SET NULL means the FK is cleared rather than the history row being dropped.
    record_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("data_records.id", ondelete="SET NULL"), nullable=True, index=True
    )
    file_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    field_name: Mapped[str] = mapped_column(String(255), nullable=False)
    old_value: Mapped[str] = mapped_column(Text, nullable=True)
    new_value: Mapped[str] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str] = mapped_column(String(255), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # No back-reference to DataRecord — record may be NULL for deleted-record events.

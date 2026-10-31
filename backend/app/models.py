"""ORM models.

State design: the live dataset and the current solution are stored as JSON
documents in `kv_state` (single-writer demo deployment). Users, manual
bookings, change requests and the audit log are relational.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(40))  # admin | department_coordinator | faculty | club
    name: Mapped[str] = mapped_column(String(120))


class KVState(Base):
    __tablename__ = "kv_state"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class ManualBooking(Base):
    """A venue request created in-app (manual form or AI-parsed)."""

    __tablename__ = "manual_bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    payload: Mapped[str] = mapped_column(Text)      # booking request JSON (dataset shape)
    status: Mapped[str] = mapped_column(String(40), default="pending")  # pending|approved|rejected|alternative_offered
    decision: Mapped[str] = mapped_column(Text, default="{}")  # decision JSON
    created_by: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


class ChangeRequest(Base):
    """A schedule change (disruption) submitted by a user, with a proposal."""

    __tablename__ = "change_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    payload: Mapped[str] = mapped_column(Text)      # change file JSON {"changes": [...]}
    status: Mapped[str] = mapped_column(String(40), default="pending")  # pending|approved|rejected
    proposal: Mapped[str] = mapped_column(Text, default="{}")  # {schedule, moved, reasons, infeasible}
    created_by: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(120))
    detail: Mapped[str] = mapped_column(Text, default="{}")
    at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

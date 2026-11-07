"""Audit trail for security-relevant and AI-related actions (design §8.4, §12)."""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.request_id import get_request_id
from app.modules.operations.models import AuditLog


def record(
    db: Session,
    *,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | str | None = None,
    actor_user_id: uuid.UUID | None = None,
    school_id: uuid.UUID | None = None,
    outcome: str = "success",
    metadata: dict[str, Any] | None = None,
) -> None:
    """Add an audit row to the current transaction (caller commits)."""
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            school_id=school_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            outcome=outcome,
            request_id=get_request_id(),
            metadata_json=metadata or {},
        )
    )

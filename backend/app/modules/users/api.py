from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field

from app.core.deps import ACCESS_COOKIE, DB, REFRESH_COOKIE, CurrentUser
from app.modules.users import privacy
from app.modules.users.models import User
from app.modules.users.schemas import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: CurrentUser, db: DB) -> User:
    user.display_name = body.display_name
    db.commit()
    return user


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


@router.get("/me/export")
def export_my_data(user: CurrentUser, db: DB) -> dict[str, Any]:
    """Machine-readable copy of the caller's personal data (GDPR art. 15/20)."""
    return privacy.export_user_data(db, user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(body: DeleteAccountRequest, user: CurrentUser, db: DB, response: Response) -> None:
    privacy.delete_account(db, user, body.password)
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")

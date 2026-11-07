from fastapi import APIRouter

from app.core.deps import DB, CurrentUser
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

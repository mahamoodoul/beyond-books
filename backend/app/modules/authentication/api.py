from fastapi import APIRouter, Request, Response, status

from app.core.config import get_settings
from app.core.deps import ACCESS_COOKIE, DB, REFRESH_COOKIE
from app.core.errors import UnauthenticatedError
from app.core.rate_limit import check_login_rate
from app.modules.authentication import service
from app.modules.authentication.schemas import LoginRequest, RegisterRequest
from app.modules.users.models import User
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
_REFRESH_PATH = "/api/v1/auth"


def _set_cookies(response: Response, tokens: service.IssuedTokens) -> None:
    s = get_settings()
    for name, value, max_age, path in (
        (ACCESS_COOKIE, tokens.access_token, s.access_token_ttl_s, "/"),
        (REFRESH_COOKIE, tokens.refresh_token, s.refresh_token_ttl_s, _REFRESH_PATH),
    ):
        response.set_cookie(
            name,
            value,
            max_age=max_age,
            path=path,
            httponly=True,
            secure=s.cookie_secure,
            samesite="lax",
        )


def _clear_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=_REFRESH_PATH)


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: DB) -> User:
    return service.register(db, body)


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, request: Request, response: Response, db: DB) -> User:
    ip = request.client.host if request.client else "unknown"
    check_login_rate(ip, body.email.lower())
    tokens = service.login(db, body.email, body.password, request.headers.get("user-agent"))
    _set_cookies(response, tokens)
    return tokens.user


@router.post("/refresh", response_model=UserOut)
def refresh(request: Request, response: Response, db: DB) -> User:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise UnauthenticatedError()
    tokens = service.refresh(db, token, request.headers.get("user-agent"))
    _set_cookies(response, tokens)
    return tokens.user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: DB) -> None:
    service.logout(db, request.cookies.get(REFRESH_COOKIE))
    _clear_cookies(response)

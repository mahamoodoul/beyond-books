from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    display_name: str = Field(min_length=1, max_length=120)
    account_type: Literal["teacher", "student"]
    join_code: str | None = Field(default=None, max_length=24)  # school or course code

    @model_validator(mode="after")
    def _strong_password_and_clean_code(self) -> RegisterRequest:
        from app.modules.authentication.passwords import password_problems
        from app.modules.join_codes.service import normalise

        problems = password_problems(self.password, str(self.email), self.display_name)
        if problems:
            raise ValueError("password: Weak password. " + " ".join(problems))
        if self.join_code is not None:
            code = normalise(self.join_code)
            if code and len(code) != 16:
                raise ValueError(
                    "join_code: A join code has 16 letters and digits (dashes are optional)."
                )
            self.join_code = code or None
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class DemoLoginRequest(BaseModel):
    role: Literal["teacher", "student"]


class DemoStatus(BaseModel):
    enabled: bool

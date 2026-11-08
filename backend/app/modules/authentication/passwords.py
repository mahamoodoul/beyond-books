"""Password rules, checked on the server (the form's minLength is only a convenience).

Rules (NIST-style: length and context matter more than forced symbols):
- 12 to 256 characters;
- at least two kinds of character (lower, upper, digit, other), or 16+ characters for a
  passphrase of plain words;
- not a repeat of one or two characters, not a keyboard/number run;
- not on the short list of very common passwords;
- must not contain the account's email name part or display name (5+ letters, so short
  words like "demo" or "ola" do not block ordinary passwords).
"""

from __future__ import annotations

import re

MIN_LEN = 12
MAX_LEN = 256
PASSPHRASE_LEN = 16
COMMON = {
    "password1234",
    "password12345",
    "passwordpassword",
    "123456789012",
    "1234567890123",
    "qwertyuiop12",
    "qwertyuiopasdf",
    "iloveyou1234",
    "welcome12345",
    "letmein12345",
    "adminadmin12",
    "changeme1234",
    "beyondbooks1",
    "beyondbooks12",
    "beyondbooks123",
}
RUNS = ("0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm")


def password_problems(password: str, email: str = "", display_name: str = "") -> list[str]:
    """Every rule the password breaks, in plain words. Empty list = acceptable."""
    problems: list[str] = []
    if len(password) < MIN_LEN:
        problems.append(f"Use at least {MIN_LEN} characters.")
    if len(password) > MAX_LEN:
        problems.append(f"Use at most {MAX_LEN} characters.")
    if not password:
        return problems
    lower = password.lower()
    classes = sum(
        1
        for test in (str.islower, str.isupper, str.isdigit, lambda c: not c.isalnum())
        if any(test(c) for c in password)
    )
    if classes < 2 and len(password) < PASSPHRASE_LEN:
        problems.append(
            "Mix letters with numbers or symbols, or make it a longer passphrase "
            f"({PASSPHRASE_LEN}+ characters)."
        )
    if len(set(lower)) <= 2:
        problems.append("Do not repeat the same one or two characters.")
    stripped = re.sub(r"[^a-z0-9]", "", lower)
    for run in RUNS:
        if len(stripped) >= 8 and (stripped in run * 2 or stripped in (run * 2)[::-1]):
            problems.append("Do not use a keyboard or number sequence.")
            break
    if stripped in COMMON or lower in COMMON:
        problems.append("That password is too common.")
    for piece in _personal(email, display_name):
        if piece in lower:
            problems.append("Do not include your name or email address.")
            break
    return problems


def _personal(email: str, display_name: str) -> list[str]:
    pieces: list[str] = []
    local = (email or "").split("@")[0].lower()
    for part in re.split(r"[^a-z0-9]+", local):
        if len(part) >= 5:
            pieces.append(part)
    for part in re.split(r"\s+", (display_name or "").lower()):
        part = re.sub(r"[^a-z0-9]", "", part)
        if len(part) >= 5:
            pieces.append(part)
    return pieces

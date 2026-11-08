/**
 * Password rules for live feedback while typing. A port of
 * backend/app/modules/authentication/passwords.py: the server is the authority, this only
 * lets the form warn before submit. Keep the two in step.
 */
const MIN_LEN = 12;
const MAX_LEN = 256;
const PASSPHRASE_LEN = 16;
const COMMON = new Set([
  "password1234", "password12345", "passwordpassword", "123456789012", "1234567890123", "qwertyuiop12", "qwertyuiopasdf",
  "iloveyou1234", "welcome12345", "letmein12345", "adminadmin12", "changeme1234", "beyondbooks1", "beyondbooks12", "beyondbooks123",
]);
const RUNS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

function personal(email: string, displayName: string): string[] {
  const pieces: string[] = [];
  for (const part of (email.split("@")[0] ?? "").toLowerCase().split(/[^a-z0-9]+/)) if (part.length >= 5) pieces.push(part);
  for (const raw of displayName.toLowerCase().split(/\s+/)) { const part = raw.replace(/[^a-z0-9]/g, ""); if (part.length >= 5) pieces.push(part); }
  return pieces;
}

export function passwordProblems(password: string, email = "", displayName = ""): string[] {
  const problems: string[] = [];
  if (password.length < MIN_LEN) problems.push(`Use at least ${MIN_LEN} characters.`);
  if (password.length > MAX_LEN) problems.push(`Use at most ${MAX_LEN} characters.`);
  if (!password) return problems;
  const lower = password.toLowerCase();
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 2 && password.length < PASSPHRASE_LEN) problems.push(`Mix letters with numbers or symbols, or make it a longer passphrase (${PASSPHRASE_LEN}+ characters).`);
  if (new Set(lower).size <= 2) problems.push("Do not repeat the same one or two characters.");
  const stripped = lower.replace(/[^a-z0-9]/g, "");
  if (stripped.length >= 8 && RUNS.some((run) => (run + run).includes(stripped) || [...(run + run)].reverse().join("").includes(stripped))) problems.push("Do not use a keyboard or number sequence.");
  if (COMMON.has(stripped) || COMMON.has(lower)) problems.push("That password is too common.");
  if (personal(email, displayName).some((piece) => lower.includes(piece))) problems.push("Do not include your name or email address.");
  return problems;
}

/** 0..4: a rough strength for the meter. */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (classes >= 2) score += 1;
  if (classes >= 3 || password.length >= 20) score += 1;
  return Math.min(4, score);
}

// Short, common, easy-to-type words for suggested passphrases (no names, no offensive words).
const WORDS = [
  "amber", "basil", "cedar", "coral", "delta", "ember", "fjord", "gleam", "harbor", "ivory", "jade", "kayak", "lemon", "maple",
  "nectar", "ocean", "pearl", "quartz", "river", "saffron", "tulip", "umber", "velvet", "willow", "zephyr", "cobalt", "meadow",
  "summit", "lantern", "orbit", "prairie", "thistle", "glacier", "canyon", "pebble", "sparrow", "violet", "marble", "comet", "harvest",
];

function pick<T>(items: T[]): T {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return items[buf[0]! % items.length]!;
}

/** A memorable, strong passphrase such as "cedar-orbit-velvet-fjord-47": 4 words + 2 digits. */
export function generatePassword(): string {
  const words = new Set<string>();
  while (words.size < 4) words.add(pick(WORDS));
  const digits = String(10 + (pick([...Array(90).keys()]) as number));
  return `${[...words].join("-")}-${digits}`;
}

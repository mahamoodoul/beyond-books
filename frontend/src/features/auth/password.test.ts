import { describe, expect, it } from "vitest";

import { passwordProblems, passwordStrength } from "./password";

// Same cases as backend/tests/test_join_codes.py::test_password_rules_are_enforced_by_the_server
describe("password rules (client copy)", () => {
  it("accepts good passwords and passphrases", () => {
    expect(passwordProblems("correct-horse-battery", "t@example.com", "Teacher")).toEqual([]);
    expect(passwordProblems("student-demo-123", "s@example.com", "s")).toEqual([]);
    expect(passwordProblems("purple heart beats fast", "a@b.no", "x")).toEqual([]);
  });
  it("explains each problem", () => {
    expect(passwordProblems("short1!").join()).toContain("12 characters");
    expect(passwordProblems("abcdefghijkl").join()).toContain("Mix letters");
    expect(passwordProblems("aaaaaaaaaaaa").join()).toContain("repeat");
    expect(passwordProblems("123456789012").join()).toContain("sequence");
    expect(passwordProblems("password1234").join()).toContain("too common");
    expect(passwordProblems("ingrid-hansen-2026", "ingrid@x.no", "Ingrid Hansen").join()).toContain("name or email");
  });
  it("scores strength", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abcdefghijkl")).toBe(1);
    expect(passwordStrength("correct-horse-battery")).toBe(4);
  });
});

describe("generatePassword", () => {
  it("always produces a password that passes the rules and is not predictable", async () => {
    const { generatePassword } = await import("./password");
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword();
      seen.add(pw);
      expect(passwordProblems(pw, "ingrid@x.no", "Ingrid Hansen")).toEqual([]);
      expect(pw.length).toBeGreaterThanOrEqual(20);
      expect(passwordStrength(pw)).toBe(4);
    }
    expect(seen.size).toBeGreaterThan(45);
  });
});

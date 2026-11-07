import { describe, expect, it } from "vitest";

import { firstName, timeAgo } from "./format";

describe("firstName", () => {
  it("skips titles", () => {
    expect(firstName("Ms Amara Okafor")).toBe("Amara");
    expect(firstName("Dr. Lee")).toBe("Lee");
    expect(firstName("Aisha Rahman")).toBe("Aisha");
  });
  it("copes with odd input", () => {
    expect(firstName(undefined)).toBe("");
    expect(firstName("Mr")).toBe("Mr");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-11-07T18:00:00Z");
  it("is relative for recent times", () => {
    expect(timeAgo("2026-11-07T17:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-11-07T15:00:00Z", now)).toMatch(/3 hours ago/);
  });
  it("falls back to a date after a week", () => {
    expect(timeAgo("2026-10-01T12:00:00Z", now)).not.toMatch(/ago/);
  });
});

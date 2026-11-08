import { describe, expect, it } from "vitest";

import { plural } from "./plural";

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "lesson")).toBe("1 lesson");
    expect(plural(1, "quiz", "quizzes")).toBe("1 quiz");
  });

  it("uses the plural for zero and many", () => {
    expect(plural(0, "lesson")).toBe("0 lessons");
    expect(plural(3, "quiz", "quizzes")).toBe("3 quizzes");
  });
});

import { describe, expect, it } from "vitest";

import { mockDataSource } from "@/features/demo/dataSource";

describe("mock demo data source", () => {
  it("returns teacher courses and only assigned courses for students", async () => {
    const [teacherCourses, studentCourses] = await Promise.all([
      mockDataSource.getCourses("teacher"),
      mockDataSource.getCourses("student"),
    ]);

    expect(teacherCourses.map((course) => course.id)).toEqual([
      "cell-biology",
      "forces-motion",
      "ancient-civilizations",
    ]);
    expect(studentCourses.map((course) => course.id)).toEqual(["cell-biology"]);
  });

  it("returns isolated course snapshots", async () => {
    const firstSnapshot = await mockDataSource.getCourses("teacher");
    firstSnapshot[0]!.title = "Changed locally";

    const nextSnapshot = await mockDataSource.getCourses("teacher");
    expect(nextSnapshot[0]?.title).toBe("The living cell");
  });

  it("surfaces unsupported lesson data rather than returning an empty success", async () => {
    await expect(mockDataSource.getLearningSteps("unknown-course")).rejects.toThrow(
      'No demo learning steps are available for course "unknown-course"',
    );
  });
});

import { describe, expect, it } from "vitest";

import { getCourse, getTeacherCourses, publishCourse, updateCourse, uploadSource } from "@/lib/api";

describe("course mock API", () => {
  it("creates a draft course, exposes it to teachers, and gates publishing on chapter approval", async () => {
    const upload = await uploadSource({
      name: "circulatory-system.pdf",
      size: 1024,
      type: "application/pdf",
      courseTitle: "Circulation in the human body",
      subject: "Biology",
      grade: "Grade 8",
    });

    const draft = await getCourse(upload.courseId);
    expect(draft.title).toBe("Circulation in the human body");
    expect(draft.chapters.every((chapter) => chapter.status === "Draft")).toBe(true);
    await expect(publishCourse(upload.courseId)).rejects.toThrow("Approve every chapter");

    const approvedCourse = {
      ...draft,
      chapters: draft.chapters.map((chapter) => ({ ...chapter, status: "Approved" as const })),
    };
    await updateCourse(approvedCourse);

    const publishedCourse = await publishCourse(upload.courseId);
    expect(publishedCourse.status).toBe("Published");
    expect((await getTeacherCourses()).some((course) => course.id === upload.courseId)).toBe(true);
  });
});

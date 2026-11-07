import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { AnalyticsPanel } from "./AnalyticsPanel";

const objective = (i: number, mastery: number) => ({
  objective_id: `o${i}`,
  text: `Objective ${i}: a fairly long learning objective sentence that should be clipped to one line in the list`,
  chapter_title: "Reference frames",
  students_with_evidence: 30,
  avg_mastery: mastery,
  gaps: mastery < 0.5 ? 12 : 2,
  developing: 8,
  mastered: 20,
});

const DATA = {
  course_id: "c1",
  enrolled: 51,
  min_group_size: 3,
  suppressed: false,
  total_lessons: 2,
  avg_completion_rate: 0.59,
  avg_score_rate: 0.75,
  lessons: [
    { lesson_id: "l1", title: "Reference Frames", chapter_title: "Ch 1", completed: 42, completion_rate: 0.82 },
    { lesson_id: "l2", title: "Motion in One Dimension", chapter_title: "Ch 5", completed: 18, completion_rate: 0.35 },
  ],
  assessments: [
    {
      assessment_id: "a1",
      title: "Chapter Quiz: Reference Frames",
      students_attempted: 31,
      graded_attempts: 25,
      avg_score_rate: 0.72,
      pass_rate: 0.8,
      pending_reviews: 8,
      questions: [
        { question_key: "q1", question_text: "How many chambers?", question_type: "mcq", responses: 31, avg_score_rate: 0.9, common_wrong: [{ option_key: "a", text: "Two", count: 3 }], suppressed: false },
        { question_key: "q2", question_text: "Explain why a reference frame must be specified when describing motion, with an example from the chapter.", question_type: "short_answer", responses: 31, avg_score_rate: 0.41, common_wrong: [], suppressed: false },
        { question_key: "q3", question_text: "Distance vs displacement?", question_type: "mcq", responses: 31, avg_score_rate: 0.6, common_wrong: [], suppressed: false },
        { question_key: "q4", question_text: "Convert hours to minutes.", question_type: "mcq", responses: 31, avg_score_rate: 0.55, common_wrong: [], suppressed: false },
      ],
    },
  ],
  objectives: [objective(1, 0.74), objective(2, 0.31), objective(3, 0.9), objective(4, 0.45), objective(5, 0.66), objective(6, 0.8), objective(7, 0.2)],
  missing_concepts: [{ concept: "correctly applies δd = df − d0 to get a displacement of +25 m (25 m north), including direction.", count: 14 }],
  attention: [
    { student_id: "s1", display_name: "Adam Moen", completed_lessons: 2, gap_objectives: 0, reasons: ["has not attempted: Review: Motion in One Dimension"] },
    { student_id: "s2", display_name: "Emma Berg", completed_lessons: 0, gap_objectives: 3, reasons: ["has not completed any lesson yet", "gaps in 3 objectives"] },
    { student_id: "s3", display_name: "Noah Lie", completed_lessons: 1, gap_objectives: 1, reasons: ["gaps in 1 objective"] },
    { student_id: "s4", display_name: "Sara Khan", completed_lessons: 1, gap_objectives: 0, reasons: ["has not attempted: Chapter Quiz"] },
    { student_id: "s5", display_name: "Isak Dahl", completed_lessons: 2, gap_objectives: 0, reasons: ["has not attempted: Review"] },
    { student_id: "s6", display_name: "Thea Holm", completed_lessons: 0, gap_objectives: 0, reasons: ["has not completed any lesson yet"] },
  ],
  insights: [
    { severity: "warning", kind: "inactive_students", message: "9 student(s) have not completed any lesson yet.", target_id: null },
    { severity: "info", kind: "pending_reviews", message: "Chapter Quiz: Reference Frames: 8 short answer(s) await your review.", target_id: "a1" },
  ],
};

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["analytics", "c1"], DATA);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter><AnalyticsPanel courseId="c1" /></MemoryRouter></QueryClientProvider>,
  );
}

describe("AnalyticsPanel", () => {
  it("shows the four numbers and the to-do list in brief", () => {
    const html = render();
    expect(html).toContain("9 not started");
    expect(html).toContain(">8<"); // answers to review
    expect(html).toContain("Needs your attention");
    expect(html).toContain("9 students have not completed any lesson.");
    expect(html).toContain('href="/teacher/assessments/a1"');
    expect(html).toContain("3 objectives below 50% mastery");
    expect(html).toContain("and 1 more");
    expect(html).not.toContain("including direction."); // long concept is clipped
  });

  it("previews the hardest questions, weakest objectives and students first, with show-all toggles", () => {
    const html = render();
    // hardest question first, only three of four shown
    expect(html.indexOf("Explain why a reference frame")).toBeLessThan(html.indexOf("Convert hours"));
    expect(html).not.toContain("How many chambers?");
    expect(html).toContain("Show all 4 questions");
    // weakest objective first and the list is capped at five
    const list = html.slice(html.indexOf("Weakest first"));
    expect(list.indexOf("Objective 7")).toBeLessThan(list.indexOf("Objective 2"));
    expect(list).not.toContain("Objective 3:");
    expect(html).toContain("Show all 7");
    // students: most gaps first, reasons shortened, six rows capped at five
    expect(html.indexOf("Emma Berg")).toBeLessThan(html.indexOf("Noah Lie"));
    expect(html).toContain("No attempt: Review: Motion in One Dimension");
    expect(html).toContain("No lessons done");
    expect(html).toContain("Show all 6");
    expect(html).not.toContain("Isak Dahl");
  });
});

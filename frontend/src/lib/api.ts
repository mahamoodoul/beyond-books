import { alexProgress, classAnalytics, studentAttempts, students } from "@/lib/mock/seed";
import { circulatoryCourse } from "@/lib/mock/circulatoryCourse";
import type {
  Attempt,
  ClassAnalytics,
  Course,
  StudentProgress,
  UploadedSource,
  UploadResult,
} from "@/lib/types";

export interface AssessmentSubmission {
  studentId: string;
  answers: Array<{ questionId: string; answer: string | number | boolean }>;
}

export interface CoursePatch {
  title?: string;
  subject?: string;
  grade?: string;
}

function delay<T>(value: T, milliseconds = 320): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), milliseconds));
}

function copyCourse(course: Course): Course {
  return structuredClone(course);
}

export async function getCourse(courseId = circulatoryCourse.id): Promise<Course> {
  await delay(undefined);
  if (courseId !== circulatoryCourse.id) throw new Error(`Course "${courseId}" was not found`);
  return copyCourse(circulatoryCourse);
}

export async function uploadSource(source: UploadedSource): Promise<UploadResult> {
  await delay(undefined, 600);
  if (!source.name.toLowerCase().endsWith(".pdf")) throw new Error("Please upload a PDF file.");
  if (source.size > 25 * 1024 * 1024) throw new Error("The PDF must be smaller than 25 MB.");
  return { courseId: circulatoryCourse.id, chapterCount: circulatoryCourse.chapters.length };
}

export async function updateCourse(course: Course): Promise<Course> {
  await delay(undefined, 220);
  return copyCourse(course);
}

export async function publishCourse(courseId: string): Promise<Course> {
  const course = await getCourse(courseId);
  if (course.chapters.some((chapter) => chapter.status !== "Approved")) {
    throw new Error("Approve every chapter before publishing this course.");
  }
  course.status = "Published";
  return delay(course, 220);
}

export async function submitAttempt(
  courseId: string,
  submission: AssessmentSubmission,
): Promise<Attempt> {
  const course = await getCourse(courseId);
  const questions = course.chapters.flatMap((chapter) => chapter.questions);
  if (questions.length === 0) throw new Error("No assessment questions are available yet.");
  let score = 0;
  const answers: Attempt["answers"] = submission.answers.map(({ questionId, answer }) => {
    const question = questions.find((item) => item.id === questionId);
    if (!question) throw new Error(`Question "${questionId}" was not found.`);
    const correct = question.type === "multiple-choice"
      ? answer === question.correctAnswer
      : question.type === "true-false"
        ? answer === question.correctAnswer
        : question.type === "fill-blank"
          ? question.acceptedAnswers.includes(String(answer).trim().toLowerCase())
          : String(answer).trim().length >= 35;
    if (correct) score += 1;
    return {
      questionId,
      answer,
      correct,
      feedback: correct
        ? question.explanation
        : question.type === "short-answer"
          ? "AI feedback: add more detail from the rubric to strengthen your explanation."
          : question.explanation,
    };
  });
  const maximumScore = questions.length;
  const attempt: Attempt = {
    id: `attempt-${Date.now()}`,
    studentId: submission.studentId,
    studentName: submission.studentId === "student-1" ? "Alex Morgan" : "Demo learner",
    courseId,
    chapterId: questions[0]!.chapterId,
    submittedAt: new Date().toISOString(),
    score,
    maximumScore,
    answers,
    conceptsCovered: score >= 2 ? ["Heart chambers", "Blood-flow direction"] : ["Heart structure"],
    conceptsMissing: score < maximumScore ? ["Oxygen exchange in the lungs"] : [],
    suggestedRevision: "Revisit the heart model and trace blood from the body to the lungs, then back again.",
  };
  studentAttempts.unshift(attempt);
  return delay(structuredClone(attempt), 350);
}

export async function getStudentProgress(studentId = "student-1"): Promise<StudentProgress> {
  await delay(undefined);
  if (studentId !== alexProgress.studentId) throw new Error(`Progress for "${studentId}" was not found.`);
  return structuredClone(alexProgress);
}

export async function getClassAnalytics(courseId = circulatoryCourse.id): Promise<ClassAnalytics> {
  await delay(undefined);
  if (courseId !== classAnalytics.courseId) throw new Error(`Analytics for "${courseId}" were not found.`);
  return structuredClone(classAnalytics);
}

export async function getRoster() {
  await delay(undefined, 180);
  return students.map(({ id, name }) => ({ id, name }));
}

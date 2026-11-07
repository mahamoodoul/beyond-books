import { alexProgress, classAnalytics, studentAttempts, students } from "@/lib/mock/seed";
import { circulatoryCourse } from "@/lib/mock/circulatoryCourse";
import {
  courses as demoCourses,
  demoUsers,
  learningSteps,
  recentActivity,
} from "@/features/demo/types";
import type {
  Activity,
  Course as DemoCourse,
  DemoRole,
  DemoUser,
  LearningStep,
} from "@/features/demo/types";
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

export interface StudentCourseListing {
  course: DemoCourse;
  enrolled: boolean;
  canEnroll: boolean;
}

const studentEnrollmentStorageKey = "beyond-books-enrolled-courses";
const inMemoryStudentEnrollmentIds = new Set([circulatoryCourse.id]);

function getStudentEnrollmentIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set(inMemoryStudentEnrollmentIds);
  const stored = localStorage.getItem(studentEnrollmentStorageKey);
  if (stored === null) return new Set([circulatoryCourse.id]);

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every((courseId) => typeof courseId === "string")) {
    throw new Error("Saved course enrollments are invalid. Clear the Beyond Books site data and try again.");
  }
  return new Set(parsed);
}

function getStudentCourseCatalog(): DemoCourse[] {
  const publishedCourses: DemoCourse[] = [...courseStore.values()]
    .filter((course) => course.status === "Published")
    .map((course) => ({
      id: course.id,
      title: course.title,
      description: course.id === circulatoryCourse.id
        ? "Follow the path of blood, explore the heart’s chambers, and see how the circulatory system keeps the body moving."
        : `Learn about ${course.subject.toLowerCase()} through chapter lessons and interactive visuals.`,
      subject: course.subject,
      grade: course.grade,
      chapters: course.chapters.length,
      students: course.id === circulatoryCourse.id ? students.length : 0,
      completion: 0,
      status: course.status,
      accent: "violet",
      lastUpdated: "Available now",
      nextChapter: course.chapters[0]?.title ?? "Start learning",
    }));

  return [...publishedCourses, ...demoCourses.map((course) => ({ ...course }))];
}

export async function getStudentCourses(): Promise<StudentCourseListing[]> {
  await delay(undefined);
  const enrolledIds = getStudentEnrollmentIds();
  return getStudentCourseCatalog().map((course) => ({
    course,
    enrolled: enrolledIds.has(course.id),
    canEnroll: course.status === "Published",
  }));
}

export async function enrollInStudentCourse(courseId: string): Promise<StudentCourseListing> {
  await delay(undefined, 180);
  const course = getStudentCourseCatalog().find((item) => item.id === courseId);
  if (!course) throw new Error(`Course "${courseId}" was not found.`);
  if (course.status !== "Published") throw new Error(`Course "${course.title}" is not available to students yet.`);

  const enrolledIds = getStudentEnrollmentIds();
  enrolledIds.add(courseId);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(studentEnrollmentStorageKey, JSON.stringify([...enrolledIds]));
  } else {
    inMemoryStudentEnrollmentIds.add(courseId);
  }
  return { course, enrolled: true, canEnroll: true };
}

export async function getTeacherCourses(): Promise<DemoCourse[]> {
  await delay(undefined);
  const generatedCourses: DemoCourse[] = [...courseStore.values()].map((course) => ({
    id: course.id,
    title: course.title,
    subject: course.subject,
    grade: course.grade,
    chapters: course.chapters.length,
    students: course.id === circulatoryCourse.id ? students.length : 0,
    completion: 0,
    status: course.status,
    accent: "violet",
    lastUpdated: course.status === "Published" ? "Published just now" : "Created just now",
    nextChapter: course.chapters[0]?.title ?? "Add your first chapter",
  }));
  return [...generatedCourses, ...demoCourses.map((course) => ({ ...course }))];
}

export async function getRecentActivity(): Promise<Activity[]> {
  await delay(undefined);
  return recentActivity.map((activity) => ({ ...activity }));
}

export async function getDemoUser(role: DemoRole): Promise<DemoUser> {
  await delay(undefined, 100);
  return { ...demoUsers[role] };
}

export async function getLearningSteps(courseId: string): Promise<LearningStep[]> {
  await delay(undefined);
  if (courseId !== "cell-biology") throw new Error(`Learning steps for "${courseId}" were not found.`);
  return learningSteps.map((step) => ({ ...step }));
}

const courseStore = new Map<string, Course>([[circulatoryCourse.id, copyCourse(circulatoryCourse)]]);

function delay<T>(value: T, milliseconds = 320): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), milliseconds));
}

function copyCourse(course: Course): Course {
  return structuredClone(course);
}

export async function getCourse(courseId = circulatoryCourse.id): Promise<Course> {
  await delay(undefined);
  const course = courseStore.get(courseId);
  if (!course) throw new Error(`Course "${courseId}" was not found`);
  return copyCourse(course);
}

export async function uploadSource(source: UploadedSource): Promise<UploadResult> {
  await delay(undefined, 600);
  if (!source.name.toLowerCase().endsWith(".pdf")) throw new Error("Please upload a PDF file.");
  if (source.size > 25 * 1024 * 1024) throw new Error("The PDF must be smaller than 25 MB.");
  const draft = copyCourse(circulatoryCourse);
  draft.id = `course-${Date.now()}`;
  draft.title = source.courseTitle.trim() || circulatoryCourse.title;
  draft.subject = source.subject.trim() || circulatoryCourse.subject;
  draft.grade = source.grade.trim() || circulatoryCourse.grade;
  draft.sourceName = source.name;
  draft.status = "Draft";
  draft.chapters = draft.chapters.map((chapter) => ({ ...chapter, status: "Draft" }));
  courseStore.set(draft.id, draft);
  return { courseId: draft.id, chapterCount: draft.chapters.length };
}

export async function updateCourse(course: Course): Promise<Course> {
  await delay(undefined, 220);
  if (!courseStore.has(course.id)) throw new Error(`Course "${course.id}" was not found.`);
  const updated = copyCourse(course);
  courseStore.set(updated.id, updated);
  return copyCourse(updated);
}

export async function publishCourse(courseId: string): Promise<Course> {
  const course = courseStore.get(courseId);
  if (!course) throw new Error(`Course "${courseId}" was not found.`);
  if (course.chapters.some((chapter) => chapter.status !== "Approved")) {
    throw new Error("Approve every chapter before publishing this course.");
  }
  const updated = { ...course, status: "Published" as const };
  courseStore.set(courseId, updated);
  return delay(copyCourse(updated), 220);
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

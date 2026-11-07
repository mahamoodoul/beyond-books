export type ChapterStatus = "Draft" | "Reviewed" | "Approved";
export type CourseStatus = "Draft" | "Published";

export interface KeyTerm {
  id: string;
  term: string;
  definition: string;
}

export interface Lesson {
  id: string;
  title: string;
  objectives: string[];
  explanation: string;
  keyTerms: KeyTerm[];
  examples: string[];
  summary: string;
}

export interface Hotspot {
  id: string;
  label: string;
  explanation: string;
  position: { x: number; y: number; z: number };
}

export interface AnimationStep {
  id: string;
  caption: string;
  lessonText: string;
  activeParts: string[];
}

export interface Model3D {
  url: string | null;
  alt: string;
  description: string;
  hotspots: Hotspot[];
  animationSteps: AnimationStep[];
}

export interface Rubric {
  criteria: string[];
  maximumScore: number;
}

export interface QuestionBase {
  id: string;
  prompt: string;
  explanation: string;
  chapterId: string;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: "multiple-choice";
  options: string[];
  correctAnswer: number;
}

export interface TrueFalseQuestion extends QuestionBase {
  type: "true-false";
  correctAnswer: boolean;
}

export interface FillBlankQuestion extends QuestionBase {
  type: "fill-blank";
  correctAnswer: string;
  acceptedAnswers: string[];
}

export interface ShortAnswerQuestion extends QuestionBase {
  type: "short-answer";
  rubric: Rubric;
  sampleAnswer: string;
}

export type Question =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | FillBlankQuestion
  | ShortAnswerQuestion;

export interface Chapter {
  id: string;
  title: string;
  status: ChapterStatus;
  lesson: Lesson;
  model: Model3D;
  questions: Question[];
}

export interface Course {
  id: string;
  title: string;
  subject: string;
  grade: string;
  description: string;
  sourceName: string;
  status: CourseStatus;
  chapters: Chapter[];
}

export interface AttemptAnswer {
  questionId: string;
  answer: string | number | boolean;
  correct: boolean;
  feedback: string;
}

export interface Attempt {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  chapterId: string;
  submittedAt: string;
  score: number;
  maximumScore: number;
  answers: AttemptAnswer[];
  conceptsCovered: string[];
  conceptsMissing: string[];
  suggestedRevision: string;
}

export interface StudentProgress {
  studentId: string;
  studentName: string;
  completedChapterIds: string[];
  courseCompletion: number;
  currentStreak: number;
  weeklyMinutes: number[];
  attempts: Attempt[];
  strengths: string[];
  topicsToRevisit: string[];
}

export interface StudentChapterPerformance {
  studentId: string;
  studentName: string;
  scores: Record<string, number>;
}

export interface ClassAnalytics {
  courseId: string;
  classAverage: number;
  completionRate: number;
  activeStudents: number;
  atRiskStudents: number;
  chapterAverages: Array<{ chapterId: string; chapterTitle: string; score: number }>;
  studentPerformance: StudentChapterPerformance[];
  misconceptions: Array<{ concept: string; missingPercent: number; chapterId: string }>;
  studentsNeedingSupport: Array<{ studentId: string; name: string; reason: string; chapterId: string }>;
}

export interface UploadedSource {
  name: string;
  size: number;
  type: string;
  courseTitle: string;
  subject: string;
  grade: string;
}

export interface UploadResult {
  courseId: string;
  chapterCount: number;
}

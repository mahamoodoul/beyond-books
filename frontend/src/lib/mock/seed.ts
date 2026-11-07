import { circulatoryCourse } from "@/lib/mock/circulatoryCourse";
import type { Attempt, ClassAnalytics, StudentChapterPerformance, StudentProgress } from "@/lib/types";

const roster = [
  "Alex Morgan", "Maya Chen", "Noah Williams", "Sofia Patel", "Ethan Brooks",
  "Ava Thompson", "Liam Garcia", "Amira Hassan", "Oliver Reed", "Isla Martin",
  "Leo Nguyen", "Zara Ahmed", "Theo Walker", "Mia Robinson", "Arjun Shah",
  "Ella Cooper", "Kai Johnson", "Layla Scott", "Oscar Green", "Nina Flores",
  "Ezra King", "Ivy Turner", "Samir Ali", "Ruby Price", "Finn Murphy",
];

export const students = roster.map((name, index) => {
  const score = 48 + ((index * 17 + 13) % 49);
  return {
    id: `student-${index + 1}`,
    name,
    score,
    completed: index % 7 !== 0,
    heart: Math.max(34, Math.min(100, score + ((index % 5) - 2) * 5)),
    vessels: Math.max(30, Math.min(100, score + ((index % 7) - 3) * 4)),
    blood: Math.max(30, Math.min(100, score + ((index % 4) - 1) * 6)),
    lungs: Math.max(30, Math.min(100, score + ((index % 6) - 2) * 5)),
    health: Math.max(30, Math.min(100, score + ((index % 3) - 1) * 7)),
  };
});

export const studentAttempts: Attempt[] = [
  {
    id: "attempt-alex-heart-1",
    studentId: "student-1",
    studentName: "Alex Morgan",
    courseId: circulatoryCourse.id,
    chapterId: "heart-structure",
    submittedAt: "2026-11-06T15:40:00.000Z",
    score: 3,
    maximumScore: 4,
    answers: [
      { questionId: "q-heart-chambers", answer: 3, correct: true, feedback: "Correct. The left ventricle pumps blood to the body." },
      { questionId: "q-valves", answer: true, correct: true, feedback: "Exactly. Valves keep blood moving forward." },
      { questionId: "q-artery", answer: "artery", correct: true, feedback: "You got it." },
      { questionId: "q-explain-flow", answer: "The right side sends blood to lungs, then the left side sends blood to body.", correct: false, feedback: "Good start. Add that blood picks up oxygen in the lungs." },
    ],
    conceptsCovered: ["right side sends blood to the lungs", "left side pumps blood to the body"],
    conceptsMissing: ["blood picks up oxygen in the lungs"],
    suggestedRevision: "Revisit the blood-flow animation and notice where oxygen enters the blood.",
  },
  {
    id: "attempt-alex-vessels-1",
    studentId: "student-1",
    studentName: "Alex Morgan",
    courseId: circulatoryCourse.id,
    chapterId: "blood-vessels",
    submittedAt: "2026-11-08T14:12:00.000Z",
    score: 2,
    maximumScore: 4,
    answers: [
      { questionId: "q-artery", answer: "artery", correct: true, feedback: "Arteries carry blood away from the heart." },
      { questionId: "q-veins", answer: "veins", correct: true, feedback: "Veins return blood to the heart." },
      { questionId: "q-capillary-exchange", answer: "oxygen moves to tissues", correct: false, feedback: "Include how carbon dioxide moves back into the blood." },
      { questionId: "q-vessel-wall", answer: "thick wall", correct: false, feedback: "Compare how vessel walls relate to blood pressure." },
    ],
    conceptsCovered: ["Artery direction", "Vein direction"],
    conceptsMissing: ["Capillary exchange", "Vessel wall structure"],
    suggestedRevision: "Review how capillaries connect arteries and veins and exchange materials with tissues.",
  },
  {
    id: "attempt-alex-blood-1",
    studentId: "student-1",
    studentName: "Alex Morgan",
    courseId: circulatoryCourse.id,
    chapterId: "blood-components",
    submittedAt: "2026-11-10T10:25:00.000Z",
    score: 4,
    maximumScore: 4,
    answers: [
      { questionId: "q-red-cells", answer: "red blood cells", correct: true, feedback: "Red blood cells carry oxygen." },
      { questionId: "q-white-cells", answer: "white blood cells", correct: true, feedback: "White blood cells help defend the body." },
      { questionId: "q-platelets", answer: "platelets", correct: true, feedback: "Platelets help blood clot." },
      { questionId: "q-plasma", answer: "plasma", correct: true, feedback: "Plasma is the liquid part of blood." },
    ],
    conceptsCovered: ["Blood components", "Oxygen transport", "Clotting"],
    conceptsMissing: [],
    suggestedRevision: "Keep connecting each blood component to its role in the circulatory system.",
  },
  {
    id: "attempt-maya-vessels-1",
    studentId: "student-2",
    studentName: "Maya Chen",
    courseId: circulatoryCourse.id,
    chapterId: "blood-vessels",
    submittedAt: "2026-11-07T08:18:00.000Z",
    score: 4,
    maximumScore: 4,
    answers: [
      { questionId: "q-artery", answer: "artery", correct: true, feedback: "Correct. Arteries carry blood away from the heart." },
    ],
    conceptsCovered: ["arteries carry blood away from the heart"],
    conceptsMissing: [],
    suggestedRevision: "Try explaining the capillary exchange in your own words.",
  },
  {
    id: "attempt-noah-heart-1",
    studentId: "student-3",
    studentName: "Noah Williams",
    courseId: circulatoryCourse.id,
    chapterId: "heart-structure",
    submittedAt: "2026-11-05T11:05:00.000Z",
    score: 2,
    maximumScore: 4,
    answers: [
      { questionId: "q-heart-chambers", answer: 1, correct: false, feedback: "The left ventricle sends oxygen-rich blood to the body." },
    ],
    conceptsCovered: ["heart has four chambers"],
    conceptsMissing: ["left ventricle pumps to the body", "right ventricle pumps to the lungs"],
    suggestedRevision: "Use the chamber labels to trace one complete loop through the heart.",
  },
];

export const alexProgress: StudentProgress = {
  studentId: "student-1",
  studentName: "Alex Morgan",
  completedChapterIds: ["heart-structure", "blood-vessels"],
  courseCompletion: 40,
  currentStreak: 4,
  weeklyMinutes: [18, 27, 21, 36, 29, 14, 8],
  attempts: studentAttempts.filter((attempt) => attempt.studentId === "student-1"),
  strengths: ["Heart chambers", "One-way valves", "Artery direction"],
  topicsToRevisit: ["Oxygen exchange in the lungs", "Capillary exchange"],
};

const chapters = circulatoryCourse.chapters;
const studentPerformance: StudentChapterPerformance[] = students.map((student) => ({
  studentId: student.id,
  studentName: student.name,
  scores: {
    "heart-structure": student.heart,
    "blood-vessels": student.vessels,
    "blood-components": student.blood,
    "lungs-circulation": student.lungs,
    "healthy-heart": student.health,
  },
}));

export const classAnalytics: ClassAnalytics = {
  courseId: circulatoryCourse.id,
  classAverage: Math.round(students.reduce((total, student) => total + student.score, 0) / students.length),
  completionRate: Math.round((students.filter((student) => student.completed).length / students.length) * 100),
  activeStudents: 22,
  atRiskStudents: students.filter((student) => student.score < 60).length,
  chapterAverages: chapters.map((chapter) => {
    const scores = studentPerformance.map((student) => student.scores[chapter.id] ?? 0);
    return {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      score: Math.round(scores.reduce((total, score) => total + score, 0) / scores.length),
    };
  }),
  studentPerformance,
  misconceptions: [
    { concept: "Arteries always carry oxygen-rich blood", missingPercent: 36, chapterId: "blood-vessels" },
    { concept: "The left ventricle pumps to the lungs", missingPercent: 28, chapterId: "heart-structure" },
    { concept: "Gas exchange happens in the heart", missingPercent: 24, chapterId: "lungs-circulation" },
  ],
  studentsNeedingSupport: students.filter((student) => student.score < 60).slice(0, 5).map((student, index) => ({
    studentId: student.id,
    name: student.name,
    reason: index % 2 === 0 ? "Heart chamber flow needs practice" : "Missed the last two check-ins",
    chapterId: index % 2 === 0 ? "heart-structure" : "blood-vessels",
  })),
};

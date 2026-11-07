export type DemoRole = "teacher" | "student";
export type Theme = "light" | "dark";
export type CourseStatus = "Published" | "In review" | "Draft";

export interface DemoUser {
  name: string;
  role: DemoRole;
  initials: string;
  email: string;
}

export interface Course {
  id: string;
  title: string;
  description?: string;
  subject: string;
  grade: string;
  chapters: number;
  students: number;
  completion: number;
  status: CourseStatus;
  accent: "violet" | "mint" | "amber";
  lastUpdated: string;
  nextChapter: string;
  progress?: number;
}

export interface Activity {
  id: string;
  name: string;
  action: string;
  course: string;
  time: string;
  initials: string;
}

export interface LearningStep {
  id: string;
  title: string;
  duration: string;
  state: "complete" | "current" | "upcoming";
}

export interface WeeklyActivity {
  day: string;
  minutes: number;
}

export const demoUsers: Record<DemoRole, DemoUser> = {
  teacher: {
    name: "Olivia Bennett",
    role: "teacher",
    initials: "OB",
    email: "olivia.bennett@school.edu",
  },
  student: {
    name: "Alex Morgan",
    role: "student",
    initials: "AM",
    email: "alex.morgan@school.edu",
  },
};

export const courses: Course[] = [
  {
    id: "cell-biology",
    title: "The living cell",
    description: "Explore how organelles work together to keep plant and animal cells alive.",
    subject: "Biology",
    grade: "Grade 10",
    chapters: 8,
    students: 28,
    completion: 76,
    status: "Published",
    accent: "mint",
    lastUpdated: "Updated today",
    nextChapter: "Cell structure & function",
    progress: 62,
  },
  {
    id: "forces-motion",
    title: "Forces & motion",
    description: "Investigate the pushes, pulls, and laws that explain how objects move.",
    subject: "Physics",
    grade: "Grade 9",
    chapters: 6,
    students: 24,
    completion: 58,
    status: "Published",
    accent: "violet",
    lastUpdated: "Updated yesterday",
    nextChapter: "Newton's second law",
    progress: 34,
  },
  {
    id: "ancient-civilizations",
    title: "Ancient civilizations",
    description: "Discover how early societies along rivers built lasting cultures and cities.",
    subject: "World history",
    grade: "Grade 8",
    chapters: 10,
    students: 31,
    completion: 0,
    status: "In review",
    accent: "amber",
    lastUpdated: "Edited 2 days ago",
    nextChapter: "Life along the Nile",
    progress: 16,
  },
];

export const recentActivity: Activity[] = [
  {
    id: "activity-1",
    name: "Maya Chen",
    action: "completed a lesson in",
    course: "The living cell",
    time: "8 min ago",
    initials: "MC",
  },
  {
    id: "activity-2",
    name: "Noah Williams",
    action: "scored 9/10 on a quiz in",
    course: "Forces & motion",
    time: "24 min ago",
    initials: "NW",
  },
  {
    id: "activity-3",
    name: "Sofia Patel",
    action: "asked for more help in",
    course: "The living cell",
    time: "1 hr ago",
    initials: "SP",
  },
];

export const learningSteps: LearningStep[] = [
  { id: "overview", title: "A cell's tiny world", duration: "3 min", state: "complete" },
  { id: "organelles", title: "Meet the organelles", duration: "8 min", state: "current" },
  { id: "quiz", title: "Check your understanding", duration: "5 min", state: "upcoming" },
];

export const weeklyActivity: WeeklyActivity[] = [
  { day: "M", minutes: 24 },
  { day: "T", minutes: 38 },
  { day: "W", minutes: 29 },
  { day: "T", minutes: 48 },
  { day: "F", minutes: 35 },
  { day: "S", minutes: 18 },
  { day: "S", minutes: 10 },
];

export function getCourse(courseId: string): Course | undefined {
  return courses.find((course) => course.id === courseId);
}

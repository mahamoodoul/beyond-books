import {
  courses,
  learningSteps,
  recentActivity,
  weeklyActivity,
  type Activity,
  type Course,
  type DemoRole,
  type LearningStep,
  type WeeklyActivity,
} from "@/features/demo/types";

export interface BeyondBooksDataSource {
  getCourses(role: DemoRole): Promise<Course[]>;
  getRecentActivity(): Promise<Activity[]>;
  getLearningSteps(courseId: string): Promise<LearningStep[]>;
  getWeeklyActivity(): Promise<WeeklyActivity[]>;
}

export const mockDataSource: BeyondBooksDataSource = {
  async getCourses(role) {
    const assignedCourses = role === "student"
      ? courses.filter((course) => course.id === "cell-biology")
      : courses;
    return assignedCourses.map((course) => ({ ...course }));
  },
  async getRecentActivity() {
    return recentActivity.map((activity) => ({ ...activity }));
  },
  async getLearningSteps(courseId) {
    if (courseId !== "cell-biology") {
      throw new Error(`No demo learning steps are available for course "${courseId}"`);
    }
    return learningSteps.map((step) => ({ ...step }));
  },
  async getWeeklyActivity() {
    return weeklyActivity.map((day) => ({ ...day }));
  },
};

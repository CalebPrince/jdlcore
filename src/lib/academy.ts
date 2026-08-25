import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireDb } from "@/db";
import {
  academyCertificates,
  academyCourses,
  academyEnrollments,
  academyLessonProgress,
  academyLessons,
  academyModules,
  academyQuizOptions,
  academyQuizQuestions,
} from "@/db/schema";

export async function getLearnerDashboard(learnerId: number) {
  const database = requireDb();
  const enrollments = await database.select({
    enrollmentId: academyEnrollments.id,
    courseId: academyCourses.id,
    slug: academyCourses.slug,
    code: academyCourses.code,
    title: academyCourses.title,
    summary: academyCourses.summary,
    level: academyCourses.level,
    accent: academyCourses.accent,
    estimatedMinutes: academyCourses.estimatedMinutes,
    status: academyEnrollments.status,
    enrolledAt: academyEnrollments.enrolledAt,
  }).from(academyEnrollments)
    .innerJoin(academyCourses, eq(academyEnrollments.courseId, academyCourses.id))
    .where(eq(academyEnrollments.learnerId, learnerId));

  if (!enrollments.length) return { courses: [], certificates: [] };
  const courseIds = enrollments.map((item) => item.courseId);
  const lessons = await database.select({ id: academyLessons.id, courseId: academyModules.courseId })
    .from(academyLessons).innerJoin(academyModules, eq(academyLessons.moduleId, academyModules.id))
    .where(and(inArray(academyModules.courseId, courseIds), eq(academyLessons.published, true)));
  const lessonIds = lessons.map((item) => item.id);
  const progress = lessonIds.length ? await database.select().from(academyLessonProgress)
    .where(and(eq(academyLessonProgress.learnerId, learnerId), inArray(academyLessonProgress.lessonId, lessonIds))) : [];
  const completed = new Set(progress.filter((item) => item.completed).map((item) => item.lessonId));
  const courses = enrollments.map((course) => {
    const courseLessons = lessons.filter((lesson) => lesson.courseId === course.courseId);
    const completedCount = courseLessons.filter((lesson) => completed.has(lesson.id)).length;
    return { ...course, lessonCount: courseLessons.length, completedCount, progress: courseLessons.length ? Math.round(completedCount / courseLessons.length * 100) : 0 };
  });
  const certificates = await database.select({
    id: academyCertificates.id,
    certificateNumber: academyCertificates.certificateNumber,
    issuedAt: academyCertificates.issuedAt,
    courseTitle: academyCourses.title,
  }).from(academyCertificates).innerJoin(academyCourses, eq(academyCertificates.courseId, academyCourses.id))
    .where(eq(academyCertificates.learnerId, learnerId));
  return { courses, certificates };
}

export async function getCourseForLearner(learnerId: number, slug: string) {
  const database = requireDb();
  const courseRows = await database.select().from(academyCourses)
    .where(and(eq(academyCourses.slug, slug), eq(academyCourses.status, "published"))).limit(1);
  const course = courseRows[0];
  if (!course) return null;
  const enrolled = await database.select({ id: academyEnrollments.id }).from(academyEnrollments)
    .where(and(eq(academyEnrollments.learnerId, learnerId), eq(academyEnrollments.courseId, course.id))).limit(1);
  if (!enrolled.length) return { course, enrolled: false, modules: [] };
  const modules = await database.select().from(academyModules)
    .where(eq(academyModules.courseId, course.id)).orderBy(asc(academyModules.position));
  const moduleIds = modules.map((item) => item.id);
  const lessons = moduleIds.length ? await database.select().from(academyLessons)
    .where(and(inArray(academyLessons.moduleId, moduleIds), eq(academyLessons.published, true)))
    .orderBy(asc(academyLessons.position)) : [];
  const lessonIds = lessons.map((item) => item.id);
  const progressRows = lessonIds.length ? await database.select().from(academyLessonProgress)
    .where(and(eq(academyLessonProgress.learnerId, learnerId), inArray(academyLessonProgress.lessonId, lessonIds))) : [];
  const progress = new Map(progressRows.map((item) => [item.lessonId, item]));
  return { course, enrolled: true, modules: modules.map((module) => ({ ...module, lessons: lessons.filter((lesson) => lesson.moduleId === module.id).map((lesson) => ({ ...lesson, completed: progress.get(lesson.id)?.completed ?? false })) })) };
}

export async function listPublishedAcademyCourses() {
  return requireDb().select().from(academyCourses).where(eq(academyCourses.status, "published")).orderBy(asc(academyCourses.id));
}

export async function getLessonForLearner(learnerId: number, courseSlug: string, lessonSlug: string) {
  const database = requireDb();
  const rows = await database.select({
    lesson: academyLessons,
    module: academyModules,
    course: academyCourses,
  }).from(academyLessons)
    .innerJoin(academyModules, eq(academyLessons.moduleId, academyModules.id))
    .innerJoin(academyCourses, eq(academyModules.courseId, academyCourses.id))
    .where(and(eq(academyCourses.slug, courseSlug), eq(academyLessons.slug, lessonSlug), eq(academyLessons.published, true))).limit(1);
  const result = rows[0];
  if (!result) return null;
  const enrollment = await database.select({ id: academyEnrollments.id }).from(academyEnrollments)
    .where(and(eq(academyEnrollments.learnerId, learnerId), eq(academyEnrollments.courseId, result.course.id))).limit(1);
  if (!enrollment.length) return null;
  const progress = await database.select().from(academyLessonProgress)
    .where(and(eq(academyLessonProgress.learnerId, learnerId), eq(academyLessonProgress.lessonId, result.lesson.id))).limit(1);
  let questions: { id: number; prompt: string; position: number; options: { id: number; label: string; position: number }[] }[] = [];
  if (result.lesson.kind === "quiz" || result.lesson.kind === "assessment") {
    const questionRows = await database.select({ id: academyQuizQuestions.id, prompt: academyQuizQuestions.prompt, position: academyQuizQuestions.position })
      .from(academyQuizQuestions).where(eq(academyQuizQuestions.lessonId, result.lesson.id)).orderBy(asc(academyQuizQuestions.position));
    const ids = questionRows.map((question) => question.id);
    const optionRows = ids.length ? await database.select({ id: academyQuizOptions.id, questionId: academyQuizOptions.questionId, label: academyQuizOptions.label, position: academyQuizOptions.position })
      .from(academyQuizOptions).where(inArray(academyQuizOptions.questionId, ids)).orderBy(asc(academyQuizOptions.position)) : [];
    questions = questionRows.map((question) => ({ ...question, options: optionRows.filter((option) => option.questionId === question.id).map((option) => ({ id: option.id, label: option.label, position: option.position })) }));
  }
  return { ...result, progress: progress[0] ?? null, questions };
}

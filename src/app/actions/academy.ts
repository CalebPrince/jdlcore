"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { academyCertificates, academyCourses, academyEnrollments, academyLearners, academyLessonProgress, academyLessons, academyModules, academyQuizAttempts, academyQuizOptions, academyQuizQuestions } from "@/db/schema";
import { createAcademySession, destroyAcademySession, getAcademyLearner } from "@/lib/academy-auth";
import { hashPassword, verifyPassword } from "@/lib/portal-auth";
import type { FormState } from "./submissions";

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export async function academyLogin(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter your email and password." };
  try {
    const database = requireDb();
    const rows = await database.select().from(academyLearners)
      .where(eq(academyLearners.email, parsed.data.email.toLowerCase())).limit(1);
    const learner = rows[0];
    if (!learner || learner.status !== "active" || !verifyPassword(parsed.data.password, learner.passwordHash)) {
      return { ok: false, message: "Invalid email or password." };
    }
    await database.update(academyLearners).set({ lastLoginAt: new Date() }).where(eq(academyLearners.id, learner.id));
    await createAcademySession(learner.id);
  } catch (error) {
    console.error("academyLogin:", error);
    return { ok: false, message: "Could not sign in. Check that the Academy database tables are ready." };
  }
  redirect("/academy/lms");
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  role: z.string().trim().max(100).optional(),
  password: z.string().min(8).max(200),
});

export async function academyRegister(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter valid details and a password of at least 8 characters." };
  try {
    const database = requireDb();
    const email = parsed.data.email.toLowerCase();
    const existing = await database.select({ id: academyLearners.id }).from(academyLearners)
      .where(eq(academyLearners.email, email)).limit(1);
    if (existing.length) return { ok: false, message: "An Academy account already uses this email." };
    const inserted = await database.insert(academyLearners).values({
      name: parsed.data.name,
      email,
      company: parsed.data.company || null,
      role: parsed.data.role || "Learner",
      passwordHash: hashPassword(parsed.data.password),
      lastLoginAt: new Date(),
    }).returning({ id: academyLearners.id });
    await createAcademySession(inserted[0].id);
  } catch (error) {
    console.error("academyRegister:", error);
    return { ok: false, message: "Could not create your account. Check that the Academy database tables are ready." };
  }
  redirect("/academy/lms");
}

export async function academyLogout() {
  await destroyAcademySession();
  redirect("/academy/login");
}

export async function requireAcademyLearnerAction() {
  const learner = await getAcademyLearner();
  if (!learner) throw new Error("Unauthorized");
  return learner;
}

export async function enrollInAcademyCourse(formData: FormData) {
  const learner = await requireAcademyLearnerAction();
  const courseId = Number(formData.get("courseId"));
  if (!Number.isInteger(courseId)) throw new Error("Invalid course");
  const database = requireDb();
  const course = await database.select({ id: academyCourses.id, slug: academyCourses.slug }).from(academyCourses)
    .where(eq(academyCourses.id, courseId)).limit(1);
  if (!course[0]) throw new Error("Course not found");
  const existing = await database.select({ id: academyEnrollments.id }).from(academyEnrollments)
    .where(and(eq(academyEnrollments.learnerId, learner.id), eq(academyEnrollments.courseId, courseId))).limit(1);
  if (!existing.length) {
    await database.insert(academyEnrollments).values({ learnerId: learner.id, courseId });
  }
  redirect(`/academy/lms/courses/${course[0].slug}`);
}

export async function completeAcademyLesson(formData: FormData) {
  const learner = await requireAcademyLearnerAction();
  const lessonId = Number(formData.get("lessonId"));
  const returnTo = String(formData.get("returnTo") ?? "/academy/lms");
  if (!Number.isInteger(lessonId) || !returnTo.startsWith("/academy/")) throw new Error("Invalid lesson");
  const database = requireDb();
  const lesson = await database.select({ kind: academyLessons.kind }).from(academyLessons).where(eq(academyLessons.id, lessonId)).limit(1);
  if (!lesson[0] || lesson[0].kind === "quiz" || lesson[0].kind === "assessment") throw new Error("Complete the scored assessment instead.");
  const existing = await database.select({ id: academyLessonProgress.id }).from(academyLessonProgress)
    .where(and(eq(academyLessonProgress.learnerId, learner.id), eq(academyLessonProgress.lessonId, lessonId))).limit(1);
  const row = existing[0];
  if (row) await database.update(academyLessonProgress).set({ completed: true, completedAt: new Date(), updatedAt: new Date() }).where(eq(academyLessonProgress.id, row.id));
  else await database.insert(academyLessonProgress).values({ learnerId: learner.id, lessonId, completed: true, completedAt: new Date() });
  await checkAcademyCourseCompletion(learner.id, lessonId);
  redirect(returnTo);
}

export async function submitAcademyQuiz(_previous: FormState, formData: FormData): Promise<FormState> {
  const learner = await requireAcademyLearnerAction();
  const lessonId = Number(formData.get("lessonId"));
  const returnTo = String(formData.get("returnTo") ?? "/academy/lms");
  if (!Number.isInteger(lessonId) || !returnTo.startsWith("/academy/")) return { ok: false, message: "Invalid assessment." };
  const database = requireDb();
  const lesson = await database.select({ id: academyLessons.id, moduleId: academyLessons.moduleId, kind: academyLessons.kind }).from(academyLessons).where(eq(academyLessons.id, lessonId)).limit(1);
  if (!lesson[0] || !["quiz", "assessment"].includes(lesson[0].kind)) return { ok: false, message: "This lesson is not a scored assessment." };
  const questions = await database.select().from(academyQuizQuestions).where(eq(academyQuizQuestions.lessonId, lessonId));
  if (!questions.length) return { ok: false, message: "This assessment has no questions yet." };
  const questionIds = questions.map((question) => question.id);
  const options = await database.select().from(academyQuizOptions).where(inArray(academyQuizOptions.questionId, questionIds));
  const answers: Record<string, number> = {};
  let correct = 0;
  for (const question of questions) {
    const selectedId = Number(formData.get(`question_${question.id}`));
    const selected = options.find((option) => option.id === selectedId && option.questionId === question.id);
    if (!selected) return { ok: false, message: "Answer every question before submitting." };
    answers[String(question.id)] = selectedId;
    if (selected.correct) correct++;
  }
  const moduleRow = await database.select({ courseId: academyModules.courseId }).from(academyModules).where(eq(academyModules.id, lesson[0].moduleId)).limit(1);
  const course = moduleRow[0] ? await database.select({ passPercent: academyCourses.passPercent }).from(academyCourses).where(eq(academyCourses.id, moduleRow[0].courseId)).limit(1) : [];
  if (!course[0]) return { ok: false, message: "Course not found." };
  const scorePercent = Math.round(correct / questions.length * 100);
  const passed = scorePercent >= course[0].passPercent;
  await database.insert(academyQuizAttempts).values({ learnerId: learner.id, lessonId, answers, scorePercent, passed });
  if (passed) {
    const existing = await database.select({ id: academyLessonProgress.id }).from(academyLessonProgress).where(and(eq(academyLessonProgress.learnerId, learner.id), eq(academyLessonProgress.lessonId, lessonId))).limit(1);
    if (existing[0]) await database.update(academyLessonProgress).set({ completed: true, completedAt: new Date(), updatedAt: new Date() }).where(eq(academyLessonProgress.id, existing[0].id));
    else await database.insert(academyLessonProgress).values({ learnerId: learner.id, lessonId, completed: true, completedAt: new Date() });
    await checkAcademyCourseCompletion(learner.id, lessonId);
  }
  revalidatePath(returnTo);
  return { ok: passed, message: passed ? `Passed with ${scorePercent}%. Your progress has been updated.` : `You scored ${scorePercent}%. You need ${course[0].passPercent}% to pass. Review the lesson and try again.` };
}

async function checkAcademyCourseCompletion(learnerId: number, lessonId: number) {
  const database = requireDb();
  const link = await database.select({ courseId: academyModules.courseId }).from(academyLessons).innerJoin(academyModules, eq(academyLessons.moduleId, academyModules.id)).where(eq(academyLessons.id, lessonId)).limit(1);
  if (!link[0]) return;
  const lessons = await database.select({ id: academyLessons.id }).from(academyLessons).innerJoin(academyModules, eq(academyLessons.moduleId, academyModules.id)).where(and(eq(academyModules.courseId, link[0].courseId), eq(academyLessons.published, true)));
  const progress = await database.select({ lessonId: academyLessonProgress.lessonId }).from(academyLessonProgress).where(and(eq(academyLessonProgress.learnerId, learnerId), eq(academyLessonProgress.completed, true)));
  const completedIds = new Set(progress.map((item) => item.lessonId));
  if (!lessons.length || !lessons.every((lesson) => completedIds.has(lesson.id))) return;
  const now = new Date();
  await database.update(academyEnrollments).set({ status: "completed", completedAt: now }).where(and(eq(academyEnrollments.learnerId, learnerId), eq(academyEnrollments.courseId, link[0].courseId)));
  const certificate = await database.select({ id: academyCertificates.id }).from(academyCertificates).where(and(eq(academyCertificates.learnerId, learnerId), eq(academyCertificates.courseId, link[0].courseId))).limit(1);
  if (!certificate.length) {
    const number = `JDL-${now.getUTCFullYear()}-${String(learnerId).padStart(4,"0")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    await database.insert(academyCertificates).values({ learnerId, courseId: link[0].courseId, certificateNumber: number });
  }
}

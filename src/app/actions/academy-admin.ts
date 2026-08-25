"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { academyCertificates, academyCourses, academyEnrollments, academyLearners, academyLessons, academyModules, academyQuizOptions, academyQuizQuestions } from "@/db/schema";
import { isAuthenticated } from "@/lib/auth";
import type { FormState } from "./submissions";

async function requireAdmin() {
  if (!(await isAuthenticated())) throw new Error("Unauthorized");
}

const courseSchema = z.object({
  title: z.string().trim().min(3).max(160),
  code: z.string().trim().min(2).max(30),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().trim().min(10).max(500),
  level: z.enum(["Foundation", "Intermediate", "Professional"]),
  estimatedMinutes: z.coerce.number().int().min(0).max(10000),
});

export async function createAcademyCourse(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Complete every field. The slug must contain lowercase letters, numbers, and hyphens only." };
  try {
    await requireDb().insert(academyCourses).values({ ...parsed.data, code: parsed.data.code.toUpperCase() });
    revalidatePath("/admin/academy");
    revalidatePath("/admin/academy/courses");
    return { ok: true, message: "Course created as a draft." };
  } catch (error) {
    console.error("createAcademyCourse:", error);
    return { ok: false, message: "Could not create the course. Check that its code and slug are unique." };
  }
}

export async function setAcademyCourseStatus(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(id) || !["draft", "published", "archived"].includes(status)) throw new Error("Invalid course update");
  await requireDb().update(academyCourses).set({ status, publishedAt: status === "published" ? new Date() : null, updatedAt: new Date() }).where(eq(academyCourses.id, id));
  revalidatePath("/admin/academy");
  revalidatePath("/admin/academy/courses");
}

export async function updateAcademyCourse(formData: FormData) {
  await requireAdmin();
  const parsed = courseSchema.extend({
    id: z.coerce.number().int().positive(),
    passPercent: z.coerce.number().int().min(1).max(100),
    accent: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid course settings.");
  const { id, ...data } = parsed.data;
  await requireDb().update(academyCourses).set({ ...data, code: data.code.toUpperCase(), updatedAt: new Date() }).where(eq(academyCourses.id, id));
  revalidatePath(`/admin/academy/courses/${id}`);
  revalidatePath("/admin/academy/courses");
  revalidatePath("/academy/courses");
}

export async function setAcademyLearnerStatus(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(id) || !["active", "disabled"].includes(status)) throw new Error("Invalid learner update");
  await requireDb().update(academyLearners).set({ status }).where(eq(academyLearners.id, id));
  revalidatePath("/admin/academy/learners");
}

export async function enrollAcademyLearner(formData: FormData) {
  await requireAdmin();
  const learnerId = Number(formData.get("learnerId"));
  const courseId = Number(formData.get("courseId"));
  if (!Number.isInteger(learnerId) || !Number.isInteger(courseId)) throw new Error("Invalid enrolment");
  const existing = await requireDb().select({ id: academyEnrollments.id }).from(academyEnrollments)
    .where(and(eq(academyEnrollments.learnerId, learnerId), eq(academyEnrollments.courseId, courseId))).limit(1);
  if (!existing.length) await requireDb().insert(academyEnrollments).values({ learnerId, courseId });
  revalidatePath("/admin/academy/learners");
}

export async function createAcademyModule(formData: FormData) {
  await requireAdmin();
  const courseId = Number(formData.get("courseId"));
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!Number.isInteger(courseId) || title.length < 3 || title.length > 160) throw new Error("Invalid module");
  const existing = await requireDb().select({ position: academyModules.position }).from(academyModules).where(eq(academyModules.courseId, courseId));
  await requireDb().insert(academyModules).values({ courseId, title, description: description || null, position: existing.length ? Math.max(...existing.map((item) => item.position)) + 1 : 0 });
  revalidatePath(`/admin/academy/courses/${courseId}`);
}

export async function updateAcademyModule(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ courseId: z.coerce.number().int().positive(), moduleId: z.coerce.number().int().positive(), title: z.string().trim().min(3).max(160), description: z.string().trim().max(1000).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid module details.");
  await requireDb().update(academyModules).set({ title: parsed.data.title, description: parsed.data.description || null }).where(and(eq(academyModules.id, parsed.data.moduleId), eq(academyModules.courseId, parsed.data.courseId)));
  revalidatePath(`/admin/academy/courses/${parsed.data.courseId}`);
}

export async function deleteAcademyModule(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ courseId: z.coerce.number().int().positive(), moduleId: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid module.");
  const database = requireDb();
  await database.transaction(async (tx) => {
    await tx.delete(academyModules).where(and(eq(academyModules.id, parsed.data.moduleId), eq(academyModules.courseId, parsed.data.courseId)));
    const remaining = (await tx.select({ id: academyModules.id, position: academyModules.position }).from(academyModules).where(eq(academyModules.courseId, parsed.data.courseId))).toSorted((a, b) => a.position - b.position);
    for (let index = 0; index < remaining.length; index += 1) await tx.update(academyModules).set({ position: -(index + 1) }).where(eq(academyModules.id, remaining[index].id));
    for (let index = 0; index < remaining.length; index += 1) await tx.update(academyModules).set({ position: index }).where(eq(academyModules.id, remaining[index].id));
  });
  revalidatePath(`/admin/academy/courses/${parsed.data.courseId}`);
}

export async function moveAcademyModule(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ courseId: z.coerce.number().int().positive(), moduleId: z.coerce.number().int().positive(), direction: z.enum(["up", "down"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid module move.");
  const database = requireDb();
  const rows = await database.select({ id: academyModules.id, position: academyModules.position }).from(academyModules).where(eq(academyModules.courseId, parsed.data.courseId));
  const ordered = rows.toSorted((a, b) => a.position - b.position);
  const index = ordered.findIndex((row) => row.id === parsed.data.moduleId);
  const target = ordered[index + (parsed.data.direction === "up" ? -1 : 1)];
  if (!target) return;
  await database.transaction(async (tx) => {
    await tx.update(academyModules).set({ position: -1 }).where(eq(academyModules.id, ordered[index].id));
    await tx.update(academyModules).set({ position: ordered[index].position }).where(eq(academyModules.id, target.id));
    await tx.update(academyModules).set({ position: target.position }).where(eq(academyModules.id, ordered[index].id));
  });
  revalidatePath(`/admin/academy/courses/${parsed.data.courseId}`);
}

export async function createAcademyLesson(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    courseId: z.coerce.number().int().positive(), moduleId: z.coerce.number().int().positive(),
    title: z.string().trim().min(3).max(180), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    kind: z.enum(["reading", "video", "quiz", "assessment"]), content: z.string().trim().max(20000).optional(),
    videoUrl: z.union([z.literal(""), z.string().url().max(1000)]).optional(), resourceUrl: z.union([z.literal(""), z.string().url().max(1000)]).optional(),
    durationMinutes: z.coerce.number().int().min(0).max(1440),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid lesson details");
  const existing = await requireDb().select({ position: academyLessons.position }).from(academyLessons).where(eq(academyLessons.moduleId, parsed.data.moduleId));
  await requireDb().insert(academyLessons).values({ moduleId: parsed.data.moduleId, title: parsed.data.title, slug: parsed.data.slug, kind: parsed.data.kind, content: parsed.data.content || null, videoUrl: parsed.data.videoUrl || null, resourceUrl: parsed.data.resourceUrl || null, durationMinutes: parsed.data.durationMinutes, position: existing.length ? Math.max(...existing.map((item) => item.position)) + 1 : 0, published: true });
  revalidatePath(`/admin/academy/courses/${parsed.data.courseId}`);
}

const lessonSchema = z.object({
  courseId: z.coerce.number().int().positive(), moduleId: z.coerce.number().int().positive(), lessonId: z.coerce.number().int().positive(),
  title: z.string().trim().min(3).max(180), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: z.enum(["reading", "video", "quiz", "assessment"]), content: z.string().trim().max(20000).optional(),
  videoUrl: z.union([z.literal(""), z.string().url().max(1000)]).optional(), resourceUrl: z.union([z.literal(""), z.string().url().max(1000)]).optional(),
  durationMinutes: z.coerce.number().int().min(0).max(1440), published: z.enum(["true", "false"]),
});

export async function updateAcademyLesson(formData: FormData) {
  await requireAdmin();
  const parsed = lessonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid lesson details.");
  const data = parsed.data;
  await requireDb().update(academyLessons).set({ title: data.title, slug: data.slug, kind: data.kind, content: data.content || null, videoUrl: data.videoUrl || null, resourceUrl: data.resourceUrl || null, durationMinutes: data.durationMinutes, published: data.published === "true" }).where(and(eq(academyLessons.id, data.lessonId), eq(academyLessons.moduleId, data.moduleId)));
  revalidatePath(`/admin/academy/courses/${data.courseId}`);
}

export async function moveAcademyLesson(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ courseId: z.coerce.number().int().positive(), moduleId: z.coerce.number().int().positive(), lessonId: z.coerce.number().int().positive(), direction: z.enum(["up", "down"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid lesson move.");
  const database = requireDb();
  const rows = await database.select({ id: academyLessons.id, position: academyLessons.position }).from(academyLessons).where(eq(academyLessons.moduleId, parsed.data.moduleId));
  const ordered = rows.toSorted((a, b) => a.position - b.position);
  const index = ordered.findIndex((row) => row.id === parsed.data.lessonId);
  const target = ordered[index + (parsed.data.direction === "up" ? -1 : 1)];
  if (!target) return;
  await database.transaction(async (tx) => {
    await tx.update(academyLessons).set({ position: -1 }).where(eq(academyLessons.id, ordered[index].id));
    await tx.update(academyLessons).set({ position: ordered[index].position }).where(eq(academyLessons.id, target.id));
    await tx.update(academyLessons).set({ position: target.position }).where(eq(academyLessons.id, ordered[index].id));
  });
  revalidatePath(`/admin/academy/courses/${parsed.data.courseId}`);
}

export async function createAcademyQuizQuestion(formData: FormData) {
  await requireAdmin();
  const courseId = Number(formData.get("courseId"));
  const lessonId = Number(formData.get("lessonId"));
  const prompt = String(formData.get("prompt") ?? "").trim();
  const explanation = String(formData.get("explanation") ?? "").trim();
  const options = [0,1,2,3].map((index) => String(formData.get(`option${index}`) ?? "").trim());
  const correctIndex = Number(formData.get("correctIndex"));
  if (!Number.isInteger(courseId) || !Number.isInteger(lessonId) || prompt.length < 5 || options.some((option) => !option) || ![0,1,2,3].includes(correctIndex)) throw new Error("Invalid quiz question");
  const database = requireDb();
  const current = await database.select({ position: academyQuizQuestions.position }).from(academyQuizQuestions).where(eq(academyQuizQuestions.lessonId, lessonId));
  const inserted = await database.insert(academyQuizQuestions).values({ lessonId, prompt, explanation: explanation || null, position: current.length }).returning({ id: academyQuizQuestions.id });
  await database.insert(academyQuizOptions).values(options.map((label, position) => ({ questionId: inserted[0].id, label, position, correct: position === correctIndex })));
  revalidatePath(`/admin/academy/courses/${courseId}`);
}

const quizQuestionSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  questionId: z.coerce.number().int().positive(),
  prompt: z.string().trim().min(5).max(1000),
  explanation: z.string().trim().max(3000).optional(),
  correctIndex: z.coerce.number().int().min(0).max(3),
  option0: z.string().trim().min(1).max(500),
  option1: z.string().trim().min(1).max(500),
  option2: z.string().trim().min(1).max(500),
  option3: z.string().trim().min(1).max(500),
  option0Id: z.coerce.number().int().positive(),
  option1Id: z.coerce.number().int().positive(),
  option2Id: z.coerce.number().int().positive(),
  option3Id: z.coerce.number().int().positive(),
});

export async function updateAcademyQuizQuestion(formData: FormData) {
  await requireAdmin();
  const parsed = quizQuestionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Complete the question and all four answer options.");
  const data = parsed.data;
  const labels = [data.option0, data.option1, data.option2, data.option3];
  const optionIds = [data.option0Id, data.option1Id, data.option2Id, data.option3Id];
  const database = requireDb();
  await database.transaction(async (tx) => {
    await tx.update(academyQuizQuestions).set({ prompt: data.prompt, explanation: data.explanation || null }).where(eq(academyQuizQuestions.id, data.questionId));
    await Promise.all(optionIds.map((id, position) => tx.update(academyQuizOptions).set({ label: labels[position], correct: position === data.correctIndex, position }).where(and(eq(academyQuizOptions.id, id), eq(academyQuizOptions.questionId, data.questionId)))));
  });
  revalidatePath(`/admin/academy/courses/${data.courseId}`);
}

export async function deleteAcademyQuizQuestion(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({ courseId: z.coerce.number().int().positive(), questionId: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid quiz question.");
  await requireDb().delete(academyQuizQuestions).where(eq(academyQuizQuestions.id, parsed.data.questionId));
  revalidatePath(`/admin/academy/courses/${parsed.data.courseId}`);
}

export async function deleteAcademyLesson(formData: FormData) {
  await requireAdmin();
  const courseId = Number(formData.get("courseId"));
  const lessonId = Number(formData.get("lessonId"));
  if (!Number.isInteger(courseId) || !Number.isInteger(lessonId)) throw new Error("Invalid lesson");
  const database = requireDb();
  const lesson = (await database.select({ moduleId: academyLessons.moduleId }).from(academyLessons).where(eq(academyLessons.id, lessonId)).limit(1))[0];
  await database.delete(academyLessons).where(eq(academyLessons.id, lessonId));
  if (lesson) {
    const remaining = (await database.select({ id: academyLessons.id, position: academyLessons.position }).from(academyLessons).where(eq(academyLessons.moduleId, lesson.moduleId))).toSorted((a, b) => a.position - b.position);
    await Promise.all(remaining.map((item, position) => database.update(academyLessons).set({ position }).where(eq(academyLessons.id, item.id))));
  }
  revalidatePath(`/admin/academy/courses/${courseId}`);
}

export async function setAcademyCertificateRevoked(formData:FormData){
  await requireAdmin();
  const id=Number(formData.get("id"));
  const revoke=String(formData.get("revoke"))==="true";
  if(!Number.isInteger(id))throw new Error("Invalid certificate");
  await requireDb().update(academyCertificates).set({revokedAt:revoke?new Date():null}).where(eq(academyCertificates.id,id));
  revalidatePath("/admin/academy/credentials");
}

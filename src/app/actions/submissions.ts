"use server";

import { z } from "zod";
import { requireDb } from "@/db";
import { submissions } from "@/db/schema";

export type FormState = {
  ok: boolean;
  message: string;
};

const phoneOptional = z
  .string()
  .trim()
  .max(40)
  .optional()
  .or(z.literal(""));

const quoteSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name."),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().min(5, "Please enter a phone number."),
  email: z.string().trim().email("Please enter a valid email address."),
  service: z.string().trim().min(1, "Please select a service."),
  details: z.string().trim().max(4000).optional().or(z.literal("")),
});

export async function submitQuoteRequest(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = quoteSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    service: formData.get("service"),
    details: formData.get("details"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  try {
    await requireDb()
      .insert(submissions)
      .values({
        type: "quote",
        name: d.name,
        company: d.company || null,
        phone: d.phone,
        email: d.email,
        service: d.service,
        message: d.details || null,
      });
    return {
      ok: true,
      message:
        "Request received — we'll get back to you shortly to confirm scope and pricing.",
    };
  } catch {
    return {
      ok: false,
      message:
        "Something went wrong sending your request. Please try again or reach us on WhatsApp.",
    };
  }
}

const waitlistSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
});

export async function submitWaitlist(
  division: "analytics" | "academy",
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = waitlistSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  try {
    await requireDb()
      .insert(submissions)
      .values({
        type: `waitlist_${division}`,
        name: parsed.data.email.split("@")[0] || "Waitlist signup",
        email: parsed.data.email,
      });
    return {
      ok: true,
      message: "You're on the list — we'll let you know when we launch.",
    };
  } catch {
    return {
      ok: false,
      message: "Something went wrong. Please try again in a moment.",
    };
  }
}

const contactSchema = z.object({
  topic: z.string().trim().min(1, "Please choose what this is about."),
  name: z.string().trim().min(2, "Please enter your name."),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: phoneOptional,
  message: z.string().trim().min(10, "Please add a short message."),
});

export async function submitContactMessage(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = contactSchema.safeParse({
    topic: formData.get("topic"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  try {
    await requireDb()
      .insert(submissions)
      .values({
        type: "contact",
        name: d.name,
        phone: d.phone || null,
        email: d.email,
        service: d.topic,
        message: d.message,
      });
    return {
      ok: true,
      message: "Message sent — we'll get back to you soon.",
    };
  } catch {
    return {
      ok: false,
      message:
        "Something went wrong sending your message. Please try again or use WhatsApp.",
    };
  }
}

const handoffSchema = z.object({
  name: z.string().trim().min(2),
  contact: z.string().trim().min(5, "Please leave a phone number or email."),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function submitChatHandoff(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = handoffSchema.safeParse({
    name: formData.get("name"),
    contact: formData.get("contact"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  try {
    await requireDb()
      .insert(submissions)
      .values({
        type: "chat_handoff",
        name: d.name,
        phone: d.contact.includes("@") ? null : d.contact,
        email: d.contact.includes("@") ? d.contact : null,
        message: d.note || null,
      });
    return { ok: true, message: "Got it — the team will reach out soon." };
  } catch {
    return {
      ok: false,
      message: "Couldn't send just now — please try WhatsApp instead.",
    };
  }
}

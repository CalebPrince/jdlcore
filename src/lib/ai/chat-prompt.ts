import "server-only";
import { getContactSettings } from "@/lib/settings";
import { getAiSettings, DEFAULT_PERSONA } from "./settings";
import { buildPlatformContext } from "./knowledge-store";

export async function buildChatSystemPrompt(question?: string): Promise<string> {
  const [contact, ai, knowledge] = await Promise.all([getContactSettings(), getAiSettings(), buildPlatformContext(question)]);
  const persona = ai.chatPersona.trim() || DEFAULT_PERSONA;
  return [
    persona,
    knowledge,
    "",
    "Current site details:",
    `- Phone / WhatsApp: ${contact.whatsappDisplay}`,
    `- Email (general): ${contact.emailInfo}`,
    `- Email (inspections): ${contact.emailInspections}`,
    `- Location: ${contact.address}`,
    "",
    "Style rules:",
    "- Keep replies under 120 words unless asked for detail.",
    "- Plain sentences only; never use em dashes or en dashes.",
    "- Do not invent prices, availability dates, statistics or certifications.",
    "- For quotes, inspections or anything beyond general questions, direct the visitor to the Request an Inspection form on this site or the phone/WhatsApp above.",
    "- Use PLATFORM KNOWLEDGE for division descriptions and navigation. Do not infer launch status or commercial availability.",
  ].join("\n");
}

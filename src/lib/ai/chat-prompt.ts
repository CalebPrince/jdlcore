import "server-only";
import { getContactSettings } from "@/lib/settings";
import { getAiSettings, DEFAULT_PERSONA } from "./settings";

export async function buildChatSystemPrompt(): Promise<string> {
  const [contact, ai] = await Promise.all([getContactSettings(), getAiSettings()]);
  const persona = ai.chatPersona.trim() || DEFAULT_PERSONA;
  return [
    persona,
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
    "- Analytics and Academy divisions are in development; say so if asked instead of promising services they do not offer yet.",
  ].join("\n");
}

import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { getContactSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Cookie Policy", description: "How JDL Core uses cookies and similar browser technologies." };

const sections: LegalSection[] = [
  { title: "What cookies are", content: <><p>Cookies are small text files or similar browser records placed on a device when a website is used. They can support security, remember a session, store preferences, and help a service function consistently.</p></> },
  { title: "Cookies we currently use", content: <><p>JDL Core uses essential cookies or equivalent session technologies to authenticate staff, clients, inspectors, Analytics subscribers, and Academy learners; maintain secure sessions; protect restricted routes; and support core application behavior.</p><p>These technologies are necessary for requested authenticated features. Blocking them may prevent sign-in or cause a workspace to stop functioning correctly.</p></> },
  { title: "Analytics and advertising", content: <><p>The current application does not intentionally use third-party advertising cookies or cross-site behavioural advertising. If optional analytics or marketing technologies are introduced, this policy and any required consent controls should be updated before those technologies are activated.</p></> },
  { title: "Third-party services", content: <><p>External services opened from JDL Core—such as WhatsApp or other linked websites—may set their own cookies under their own policies. JDL Core does not control cookies placed after you leave our domain.</p></> },
  { title: "Managing cookies", content: <><p>You can inspect, block, or delete cookies using browser settings. Most browsers also allow restrictions on third-party cookies. Clearing essential session cookies will normally sign you out and may remove stored preferences.</p><p>Browser controls vary by product and version; consult your browser&apos;s privacy or cookie settings for current instructions.</p></> },
  { title: "Changes and contact", content: <><p>We may update this policy when the application introduces new technologies or when legal requirements change. Questions about cookies or related personal-data processing can be sent to the information email shown in the footer.</p></> },
];

export default async function CookiesPage() {
  return <LegalPage title="Cookie Policy" description="A clear explanation of the browser technologies used to keep JDL Core services secure and functional." updated="27 August 2026" sections={sections} settings={await getContactSettings()} />;
}

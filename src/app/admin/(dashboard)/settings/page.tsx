import {
  getContactSettings,
  DEFAULT_SETTINGS,
} from "@/lib/settings";
import { ContactSettingsForm } from "@/components/admin/contact-settings-form";

export default async function AdminSettingsPage() {
  const settings = await getContactSettings();
  const defaults: Record<string, string> = { ...DEFAULT_SETTINGS, ...settings };
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">
          Site Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage the contact information shown across the site.
        </p>
      </div>
      <ContactSettingsForm defaults={defaults} />
    </div>
  );
}

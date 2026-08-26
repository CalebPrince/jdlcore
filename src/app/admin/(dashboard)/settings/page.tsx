import { notFound } from "next/navigation";
import {
  getContactSettings,
  getInvoiceSettings,
  getReportSettings,
  DEFAULT_SETTINGS,
} from "@/lib/settings";
import { getStaff } from "@/lib/staff-auth";
import { ContactSettingsForm } from "@/components/admin/contact-settings-form";
import { InvoiceSettingsForm } from "@/components/admin/invoice-settings-form";
import { ReportSettingsForm } from "@/components/admin/report-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  const [contactSettings, invoiceSettings, reportSettings] = await Promise.all([
    getContactSettings(),
    getInvoiceSettings(),
    getReportSettings(),
  ]);
  const defaults: Record<string, string> = { ...DEFAULT_SETTINGS, ...contactSettings };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">
          Site Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Contact details, invoicing, and report template — everything editable without
          a code change. AI and email/SMTP settings, which hold API keys, live under
          their own super-admin-only pages.
        </p>
      </div>
      <ContactSettingsForm defaults={defaults} />
      <InvoiceSettingsForm defaults={invoiceSettings} />
      <ReportSettingsForm defaults={reportSettings} />
    </div>
  );
}

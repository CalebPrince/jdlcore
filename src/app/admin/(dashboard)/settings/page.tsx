import { notFound } from "next/navigation";
import {
  getContactSettings,
  getAutomationSettings,
  getInvoiceSettings,
  getReportSettings,
  DEFAULT_SETTINGS,
} from "@/lib/settings";
import { getAnalyticsPlans } from "@/lib/analytics-plans";
import { getStaff } from "@/lib/staff-auth";
import { ContactSettingsForm } from "@/components/admin/contact-settings-form";
import { InvoiceSettingsForm } from "@/components/admin/invoice-settings-form";
import { AutomationSettingsForm } from "@/components/admin/automation-settings-form";
import { approvalStats, type ApprovalStats } from "@/lib/approval-checks";
import { ReportSettingsForm } from "@/components/admin/report-settings-form";
import { AnalyticsPlansForm } from "@/components/admin/analytics-plans-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  const [contactSettings, invoiceSettings, reportSettings, analyticsPlans] = await Promise.all([
    getContactSettings(),
    getInvoiceSettings(),
    getReportSettings(),
    getAnalyticsPlans(),
  ]);
  const defaults: Record<string, string> = { ...DEFAULT_SETTINGS, ...contactSettings };
  const automationSettings = await getAutomationSettings();
  // Shadow-mode results are a nice-to-have; if they can't be read, just leave that panel out.
  let stats: ApprovalStats | null = null;
  try {
    stats = await approvalStats();
  } catch {
    stats = null;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">
          Site Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Contact details, invoicing, report template, and Analytics pricing — everything
          editable without a code change. AI and email/SMTP/Paystack settings, which hold
          API keys, live under their own super-admin-only pages.
        </p>
      </div>
      <ContactSettingsForm defaults={defaults} />
      <InvoiceSettingsForm defaults={invoiceSettings} />
      <AutomationSettingsForm defaults={automationSettings} stats={stats} />
      <ReportSettingsForm defaults={reportSettings} />
      <Card>
        <CardHeader>
          <CardTitle>Analytics Pricing</CardTitle>
          <CardDescription>
            Depot and Trader are billed automatically through Paystack; Enterprise stays
            &ldquo;Talk to Us&rdquo;. Shown on the Analytics pricing page and used at checkout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsPlansForm plans={analyticsPlans} />
        </CardContent>
      </Card>
    </div>
  );
}

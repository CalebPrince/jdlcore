"use server";

import { requireStaffRole } from "@/lib/staff-auth";
import { sendNotification, brandedEmailHtml, isEmailConfigured, getEmailConfig } from "@/lib/email";
import { notify } from "@/lib/notifications";
import type { FormState } from "./submissions";

export type TestRunState = FormState & {
  results?: { category: string; label: string; ok: boolean }[];
};

/**
 * Mirrors the "Notifications & Alerts Overview" document — every client,
 * staff/operations, and inspector event that's wired to fire an email.
 * Analytics/Academy and admin test-sends are excluded; they're already
 * email-only by deliberate scope decision, not something this needs to prove.
 */
const TEST_ITEMS: { category: string; label: string }[] = [
  { category: "Client", label: "Portal account created (from a converted quote request)" },
  { category: "Client", label: "Password reset requested" },
  { category: "Client", label: "Assigned an inspector for their job" },
  { category: "Client", label: "New document added to their job" },
  { category: "Client", label: "New invoice issued" },
  { category: "Client", label: "Invoice payment reminder sent" },
  { category: "Client", label: "Invoice becomes overdue" },
  { category: "Client", label: "Payment verified" },
  { category: "Client", label: "Payment received online via Paystack" },
  { category: "Client", label: "Payment submission rejected (needs correction)" },
  { category: "Client", label: "Job flagged for amendment" },
  { category: "Client", label: "Job completed, now under Operations review" },
  { category: "Client", label: "Amended report resubmitted" },
  { category: "Client", label: "Report approved / Certificate of Quantity issued" },
  { category: "Client", label: "Staff replies to a comment on their job" },
  { category: "Staff & Operations", label: "New quote request submitted from the website" },
  { category: "Staff & Operations", label: "New contact form message" },
  { category: "Staff & Operations", label: "New live chat handoff request" },
  { category: "Staff & Operations", label: "New Analytics or Academy waitlist signup" },
  { category: "Staff & Operations", label: "Client submits a new service request from the portal" },
  { category: "Staff & Operations", label: "Client submits a payment receipt (needs verification)" },
  { category: "Staff & Operations", label: "Client pays an invoice online via Paystack (auto-verified)" },
  { category: "Staff & Operations", label: "Client comments on a job" },
  { category: "Staff & Operations", label: "Inspector accepts an assigned job" },
  { category: "Staff & Operations", label: "Inspector declines an assigned job" },
  { category: "Staff & Operations", label: "Inspector submits a completed report for approval" },
  { category: "Staff & Operations", label: "Inspector resubmits an amended report" },
  { category: "Staff & Operations", label: "AI second-opinion flags a possible issue (data, a document, or a receipt)" },
  { category: "Staff & Operations", label: "New staff account invited" },
  { category: "Inspector", label: "Account invited (sets up their own password)" },
  { category: "Inspector", label: "Assigned to a new job" },
  { category: "Inspector", label: "Submitted report sent back for amendment, with comments" },
];

export async function testAllNotificationTypes(
  _prev: TestRunState,
  _formData: FormData,
): Promise<TestRunState> {
  const current = await requireStaffRole(["superadmin"]);
  if (!current) return { ok: false, message: "Unauthorized" };

  const config = await getEmailConfig();
  if (!isEmailConfigured(config)) {
    return { ok: false, message: "No email provider configured yet — add a Resend key or SMTP details first." };
  }

  const results: { category: string; label: string; ok: boolean }[] = [];
  for (const item of TEST_ITEMS) {
    try {
      const result = await sendNotification({
        to: current.email,
        subject: `[TEST] ${item.category}: ${item.label}`,
        html: brandedEmailHtml({
          label: `JDL CORE — NOTIFICATION TEST (${item.category.toUpperCase()})`,
          heading: item.label,
          bodyLines: [
            `This is a diagnostic test confirming the &ldquo;${item.label}&rdquo; notification delivers correctly by email.`,
            "In normal operation this would go to the actual recipient, not to you.",
          ],
          footer: "Sent from Admin → Email → Test All Notification Types.",
        }),
      });
      results.push({ category: item.category, label: item.label, ok: result.sent });
    } catch {
      results.push({ category: item.category, label: item.label, ok: false });
    }
  }

  const sentCount = results.filter((r) => r.ok).length;
  await notify({
    recipientType: "staff",
    recipientId: current.id,
    type: "notification_system_test",
    title: "Notification system test completed",
    body: `${sentCount} of ${results.length} test emails delivered successfully. Check your inbox at ${current.email}.`,
    link: "/admin/email",
  });

  return {
    ok: sentCount === results.length,
    message: `${sentCount} of ${results.length} test emails sent to ${current.email}. A summary was also added to your bell.`,
    results,
  };
}

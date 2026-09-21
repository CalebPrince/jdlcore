// The plain-language description of every automation, for the admin "Automations" page. Written for
// the client's own team, so no technical terms. Pure (no database), so it can be tested directly.

export type Cadence = "daily" | "hourly-or-daily" | "npa";

export type Automation = {
  id: string;
  name: string;
  /** One friendly sentence: what this does for you. */
  summary: string;
  /** What it actually does, step by step. */
  does: string[];
  /** What it will never do, so people know who stays in charge. */
  never: string;
  /** Plain description of when it happens. */
  when: string;
  kind: "scheduled" | "event";
  /** Scheduled automations: the key used to look up when they last ran. */
  task?: string;
  cadence?: Cadence;
  /** Automations with an on/off choice: which setting decides it. */
  switch?: "autoAssign" | "approval" | "autoInvoice";
  /** Where the team can change how it behaves. */
  where?: { label: string; href: string };
};

export const AUTOMATIONS: Automation[] = [
  // ---------------------------------------------------------------- scheduled
  {
    id: "morning-summary",
    name: "Morning summary for your team",
    summary: "One email each morning listing everything that needs a person's attention.",
    does: [
      "Jobs that have waited too long at any stage",
      "Stock monitoring jobs with no tank reading for two days",
      "Approved jobs that still have no invoice",
      "Payment receipts waiting to be checked",
      "Quote requests that haven't been turned into jobs",
      "Anything the platform did by itself in the last 24 hours (assigned, approved)",
      "A gentle reminder to an inspector who hasn't answered an assignment or returned a report for changes",
    ],
    never: "It only lists work. It never approves, assigns, or verifies anything for you.",
    when: "Every morning",
    kind: "scheduled",
    task: "ops-digest",
    cadence: "daily",
    where: { label: "Jobs", href: "/admin/jobs" },
  },
  {
    id: "invoice-reminders",
    name: "Invoice reminders",
    summary: "Clients are reminded about unpaid invoices, so nobody has to chase them by hand.",
    does: [
      "A reminder 3 days before an invoice is due",
      "Another at 7 days and at 14 days overdue",
      "Your team is alerted at the 14-day point so someone can call the client",
    ],
    never: "It never reminds a client who has already sent a payment receipt. That one is waiting on your team.",
    when: "Every morning",
    kind: "scheduled",
    task: "invoice-reminders",
    cadence: "daily",
    where: { label: "Payments", href: "/admin/payments" },
  },
  {
    id: "close-finished-jobs",
    name: "Close finished jobs",
    summary: "A job that is fully paid and certified closes itself, so the list stays tidy.",
    does: [
      "Waits 2 days after payment, in case something needs correcting",
      "Checks the Certificate of Quantity has been issued and no invoice is still open",
      "Then marks the job closed",
    ],
    never: "It never closes a job with an unpaid invoice or without its certificate.",
    when: "Every morning",
    kind: "scheduled",
    task: "auto-close",
    cadence: "daily",
    where: { label: "Jobs", href: "/admin/jobs" },
  },
  {
    id: "assignment-sweep",
    name: "Keep assignments moving",
    summary: "Jobs never sit unassigned or unanswered: waiting jobs are retried, and unanswered ones move on.",
    does: [
      "Tries again on jobs still waiting for an inspector, in case someone has become free",
      "If an inspector hasn't accepted a job within your chosen time, offers it to the next suitable person",
      "Tells the first inspector it was moved, and never gives it back to someone who already declined",
    ],
    never: "It does nothing at all unless automatic assignment is switched on, and it stops after two automatic moves so a person takes over.",
    when: "Every hour",
    kind: "scheduled",
    task: "auto-assign",
    cadence: "hourly-or-daily",
    switch: "autoAssign",
    where: { label: "Settings", href: "/admin/settings" },
  },
  {
    id: "approval-sweep",
    name: "Approve jobs that pass every check",
    summary: "Finished jobs that clearly pass all the checks are approved without waiting for someone to click.",
    does: [
      "Only looks at jobs that passed the checks when the inspector submitted them",
      "Waits out the waiting period you chose, so your team has a chance to look first",
      "Runs the checks again, and approves only if everything still passes",
      "Issues the Certificate of Quantity, exactly as when your team approves",
    ],
    never: "It can only approve, never send a job back. Anything doubtful stays with your team.",
    when: "Every hour",
    kind: "scheduled",
    task: "auto-approve",
    cadence: "hourly-or-daily",
    switch: "approval",
    where: { label: "Settings", href: "/admin/settings" },
  },
  {
    id: "resend-emails",
    name: "Resend emails that failed",
    summary: "If an email doesn't go through, it is tried again automatically.",
    does: [
      "Retries once straight away when an email fails",
      "Tries again later for up to 2 days if it still hasn't gone",
      "Stops when the address is clearly wrong, so it doesn't keep trying",
    ],
    never: "It never sends anything new. It only retries emails that were already meant to go out.",
    when: "Every hour",
    kind: "scheduled",
    task: "email-retry",
    cadence: "hourly-or-daily",
    where: { label: "Email", href: "/admin/email" },
  },
  {
    id: "online-payments-check",
    name: "Double-check online payments",
    summary: "If a client paid online but the platform missed the confirmation, it catches up.",
    does: [
      "Looks at online payments started in the last 7 days that never showed as paid",
      "Asks Paystack directly what really happened",
      "Marks the invoice paid only when Paystack confirms the payment",
    ],
    never: "If the amount doesn't match the invoice, it doesn't guess. It flags it for your team. Bank-transfer receipts are never touched.",
    when: "Every morning",
    kind: "scheduled",
    task: "paystack-reconcile",
    cadence: "daily",
    where: { label: "Payments", href: "/admin/payments" },
  },
  {
    id: "subscription-check",
    name: "Check Analytics and Academy subscriptions",
    summary: "Keeps subscribers' billing dates correct and tells your team when a subscription has really ended.",
    does: [
      "Looks at subscribers whose recorded billing period has run out",
      "Asks Paystack whether they are still renewing, and updates their dates if so",
      "Alerts your team if a subscription has genuinely ended",
    ],
    never: "It never suspends or removes anyone's access. That decision is always yours.",
    when: "Every morning",
    kind: "scheduled",
    task: "subscription-sweep",
    cadence: "daily",
    where: { label: "Analytics", href: "/admin/analytics" },
  },
  {
    id: "price-data-update",
    name: "Daily petroleum price data update",
    summary: "Collects the newest price documents from the NPA so the Analytics assistant stays up to date.",
    does: [
      "Looks for new NPA documents and adds them",
      "Retries any that failed last time",
      "Alerts your team if updates fail or nothing new has arrived for a week",
    ],
    never: "It only adds public NPA documents. It never removes anything you uploaded yourself.",
    when: "Every morning",
    kind: "scheduled",
    task: "npa-sync",
    cadence: "npa",
    where: { label: "Analytics", href: "/admin/analytics" },
  },

  // ---------------------------------------------------------------- event-driven
  {
    id: "assign-on-arrival",
    name: "Assign new jobs to the best inspector",
    summary: "When a job arrives, the platform picks a suitable inspector and writes down who and why.",
    does: [
      "Considers only inspectors you have switched on for automatic assignment",
      "Checks they are qualified for the service, work in that area, are not away, and have room for another job",
      "Prefers a local match, then whoever is least busy, then whoever has worked with that client before",
      "Writes the choice and the reason on the job, and tells the inspector and the client",
      "If nobody suitable is free, alerts your team straight away",
    ],
    never: "An inspector can still decline. If they do, it is offered to someone else. Your team can assign by hand at any time.",
    when: "As soon as a job is created, or an inspector declines it",
    kind: "event",
    switch: "autoAssign",
    where: { label: "Settings and Inspectors", href: "/admin/settings" },
  },
  {
    id: "finished-work-checks",
    name: "Checks on finished work",
    summary: "When an inspector submits finished work, the platform checks it and shows your team the result.",
    does: [
      "Figures are complete and agree with each other",
      "The AI quality review ran and raised nothing",
      "It is the first submission, not an amended one",
      "The inspector's recent jobs went through without being sent back",
      "A report is attached (if you require one)",
    ],
    never: "In Off or Shadow mode your team still approves every job. The checks are only there to help.",
    when: "As soon as an inspector submits a job for approval",
    kind: "event",
    switch: "approval",
    where: { label: "Settings", href: "/admin/settings" },
  },
  {
    id: "invoice-on-approval",
    name: "Issue the invoice when a job is approved",
    summary: "The invoice is created and sent to the client automatically, using the service's standard price.",
    does: [
      "Uses the standard price you set for the service",
      "Applies your payment terms and tax settings",
      "Emails the client the invoice",
    ],
    never: "If a service has no standard price, it does nothing and the job shows up in your morning summary for you to invoice.",
    when: "As soon as a job is approved",
    kind: "event",
    switch: "autoInvoice",
    where: { label: "Settings", href: "/admin/settings" },
  },
  {
    id: "online-payment-confirmation",
    name: "Confirm online payments instantly",
    summary: "When a client pays online, the invoice is marked paid and the client is thanked, with no one needing to check.",
    does: [
      "Confirms the payment directly with Paystack",
      "Marks the invoice and the job as paid, and emails the client",
      "Lets your team know a payment came in",
    ],
    never: "If the amount is wrong, it holds the payment for your team to review. Bank-transfer receipts are always checked by a person.",
    when: "As soon as Paystack confirms a payment",
    kind: "event",
    where: { label: "Payments", href: "/admin/payments" },
  },
  {
    id: "confirmation-emails",
    name: "Confirmation emails to visitors",
    summary: "Anyone who sends a quote request or message gets a confirmation, so they know it arrived.",
    does: ["Sends a short thank-you email straight after the request is submitted"],
    never: "It only repeats the person's own name back to them. It never promises prices or dates.",
    when: "As soon as a form is submitted",
    kind: "event",
    where: { label: "Inbox", href: "/admin/inbox" },
  },
  {
    id: "new-client-links",
    name: "Secure password links for new clients",
    summary: "New client accounts get a private link to choose their own password.",
    does: ["Emails a one-time link that works for 7 days", "Keeps a temporary password on screen for your team in case the email fails"],
    never: "A password is never sent by email.",
    when: "When a quote is turned into a job for a new client",
    kind: "event",
    where: { label: "Inbox", href: "/admin/inbox" },
  },
];

// ---------------------------------------------------------------------------------------------------

export type RunRow = { task: string; ok: boolean; startedAt: Date; source: string; summary: unknown; error: string | null };

export type Health = "healthy" | "late" | "failed" | "waiting";

/** How long a scheduled automation may go between runs before it is called "late". */
const LATE_AFTER_MS: Record<"daily" | "hourly" | "npa", number> = {
  daily: 26 * 60 * 60 * 1000,
  hourly: 150 * 60 * 1000,
  npa: 26 * 60 * 60 * 1000,
};

/**
 * Is a scheduled automation running as it should? "failed" = its last run failed; "late" = it hasn't
 * run within the expected time; "waiting" = it has never run yet (new, or history not recorded yet).
 * Tasks that run hourly when the hourly schedule is on (and once a day otherwise) are judged against
 * whichever schedule has actually been in use over the last two days.
 */
export function assessHealth(cadence: Cadence, last: RunRow | undefined, hourlySeen: boolean, nowMs: number): Health {
  if (!last) return "waiting";
  if (!last.ok) return "failed";
  const limit = cadence === "npa" ? LATE_AFTER_MS.npa : cadence === "daily" ? LATE_AFTER_MS.daily : hourlySeen ? LATE_AFTER_MS.hourly : LATE_AFTER_MS.daily;
  return nowMs - last.startedAt.getTime() > limit ? "late" : "healthy";
}

/** "12 minutes ago", "3 hours ago", "yesterday", "5 days ago". */
export function agoText(then: Date, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - then.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What a run did, in plain words. Falls back to a neutral line if the shape isn't recognised. */
export function describeRun(task: string, summary: unknown): string {
  const s = (summary && typeof summary === "object" ? summary : {}) as Record<string, unknown>;
  switch (task) {
    case "ops-digest":
      return n(s.itemsListed) === 0 ? "Nothing needed attention." : `Listed ${plural(n(s.itemsListed), "item", "items")} for your team.`;
    case "invoice-reminders": {
      const sent = n(s.dueSoon) + n(s.overdue7) + n(s.overdue14) + n(s.overdueFlagged);
      return sent === 0 ? "No reminders were due." : `Sent ${plural(sent, "reminder", "reminders")}.`;
    }
    case "auto-close":
      return n(s.closed) === 0 ? "No jobs were ready to close." : `Closed ${plural(n(s.closed), "job", "jobs")}.`;
    case "auto-assign":
      if (s.enabled === false) return "Switched off, so nothing to do.";
      return n(s.assigned) + n(s.reassigned) + n(s.unmatched) === 0
        ? "Nothing to move."
        : `Assigned ${n(s.assigned)}, moved on ${n(s.reassigned)}, ${n(s.unmatched)} still need a person.`;
    case "auto-approve":
      if (s.mode !== "auto") return "Not in Automatic mode, so nothing to do.";
      return n(s.approved) === 0 ? "No jobs were ready to approve." : `Approved ${plural(n(s.approved), "job", "jobs")}.`;
    case "email-retry":
      return n(s.tried) === 0 ? "No failed emails to retry." : `Retried ${plural(n(s.tried), "email", "emails")}, ${n(s.sent)} went through.`;
    case "paystack-reconcile":
      return n(s.checked) === 0 ? "No payments needed rechecking." : `Rechecked ${plural(n(s.checked), "payment", "payments")}, ${n(s.recovered)} caught up.`;
    case "subscription-sweep":
      return n(s.lookups) === 0 ? "No subscriptions needed checking." : `Checked ${plural(n(s.lookups), "subscription", "subscriptions")}, refreshed ${n(s.refreshed)}, ${n(s.flagged)} need a look.`;
    case "npa-sync":
      return n(s.added) === 0 ? "No new documents." : `Added ${plural(n(s.added), "new document", "new documents")}.`;
    default:
      return "Completed.";
  }
}

/** Friendly labels for the once-only alerts and reminders the platform remembers sending. */
export const EVENT_LABELS: Record<string, string> = {
  invoice_due_soon: "Invoice due-soon reminders",
  invoice_overdue_7: "7-day overdue reminders",
  invoice_overdue_14: "14-day overdue reminders",
  auto_assign_no_match: "\"Needs an inspector\" alerts",
  job_assigned_nudge: "Reminders to inspectors to answer",
  job_rejected_amendment_nudge: "Reminders to inspectors to amend",
  subscription_lapsed: "Subscription alerts",
  npa_sync_failed: "Price data update alerts",
  npa_sync_no_listing: "Price data update alerts",
  npa_sync_stale: "Price data update alerts",
};

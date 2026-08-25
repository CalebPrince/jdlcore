import type { Metadata } from "next";
import {
  EmailSettingsForm,
  TestEmailForm,
  type EmailSettingsView,
} from "@/components/admin/email-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getEmailConfig, isEmailConfigured, maskKeyLike, recentEmailLogs } from "@/lib/email";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email Notifications | JDL Core Admin" };

export default async function AdminEmailPage() {
  const config = await getEmailConfig();
  const logs = await recentEmailLogs(12);
  const view: EmailSettingsView = {
    enabled: config.enabled,
    resendKeyMasked: maskKeyLike(config.resendKey),
    smtpHost: config.smtpHost ?? "",
    smtpPort: config.smtpPort ? String(config.smtpPort) : "",
    smtpUser: config.smtpUser ?? "",
    smtpPassMasked: maskKeyLike(config.smtpPass),
    fromAddress: config.fromAddress,
    fromName: config.fromName,
    configured: isEmailConfigured(config),
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Command Center</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Email Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure how the client portal reaches your clients by email.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <CardDescription>
            Resend is simplest (one API key). SMTP works with Gmail app passwords,
            Zoho, or your own mail server. Resend takes priority when both are set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailSettingsForm view={view} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test &amp; Delivery Log</CardTitle>
          <CardDescription>
            Every notification attempt is recorded here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <TestEmailForm />
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground" style={{ borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">To</th>
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      No emails yet.
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">{log.toEmail}</td>
                    <td className="max-w-[220px] truncate px-3 py-2">{log.subject}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          log.status === "sent"
                            ? "border-[rgba(31,122,77,0.4)] text-[#1f7a4d]"
                            : log.status === "skipped"
                              ? "text-muted-foreground"
                              : "border-red-300 text-red-600"
                        }
                      >
                        {log.status}
                        {log.error ? `: ${log.error}` : ""}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { AnalyticsSetupForm } from "@/components/analytics/auth-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Activate Access | JDL Core Analytics" };

export default async function AnalyticsSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const validShape = typeof token === "string" && /^[a-f0-9]{48}$/.test(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="eyebrow text-gold-500">JDL Core Analytics</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-paper">
            Activate your access
          </h1>
        </div>
        <Card>
          {validShape ? (
            <>
              <CardHeader>
                <CardTitle className="font-display">Choose a password</CardTitle>
                <CardDescription>
                  This is the last step — pick a password and you&apos;re in.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsSetupForm token={token!} />
              </CardContent>
            </>
          ) : (
            <CardContent className="pt-6">
              <p className="m-0 text-sm text-muted-foreground">
                This invite link looks incomplete. Ask JDL Core to resend your
                access link, then open it in this browser.
              </p>
            </CardContent>
          )}
        </Card>
        <p className="mt-6 text-center text-xs">
          <Link href="/" className="text-[#8fa3b0] transition-colors hover:text-paper">
            ← Back to jdlcore.com
          </Link>
        </p>
      </div>
    </main>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { AnalyticsLoginForm } from "@/components/analytics/auth-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign In | JDL Core Analytics" };

export default function AnalyticsLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="eyebrow text-gold-500">JDL Core Analytics</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-paper">
            Sign in to your workspace
          </h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Welcome back</CardTitle>
            <CardDescription>
              Access is by invitation during the beta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyticsLoginForm />
            <p className="m-0 mt-5 text-center text-xs text-muted-foreground">
              No account yet?{" "}
              <Link href="/analytics#waitlist" className="text-gold-700 hover:underline">
                Join the waitlist
              </Link>
            </p>
          </CardContent>
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

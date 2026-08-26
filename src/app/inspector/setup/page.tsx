import Link from "next/link";
import type { Metadata } from "next";
import { InspectorSetupForm } from "@/components/inspector/inspector-setup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Activate Account | JDL Core Inspector Portal" };

export default async function InspectorSetupPage({
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
          <p className="eyebrow text-gold-500">JDL Core Inspector Portal</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-paper">
            Activate your account
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
                <InspectorSetupForm token={token!} />
              </CardContent>
            </>
          ) : (
            <CardContent className="pt-6">
              <p className="m-0 text-sm text-muted-foreground">
                This invite link looks incomplete. Ask JDL Core Operations to resend your
                setup link, then open it in this browser.
              </p>
            </CardContent>
          )}
        </Card>
        <p className="mt-6 text-center text-xs">
          <Link href="/inspector/login" className="text-[#8fa3b0] transition-colors hover:text-paper">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

import Link from "next/link";
import { ForgotPasswordForm } from "@/components/account/recovery-forms";

export const metadata = { title: "Forgot Password | JDL Core" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const requested = (await searchParams).type;
  const defaultType = requested === "analytics" || requested === "portal" ? requested : "academy";
  return <main className="grid min-h-screen place-items-center bg-paper-deep px-4 py-14"><div className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-7 shadow-xl"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-gold-700">JDL Core account recovery</p><h1 className="mt-3 font-display text-2xl font-bold text-navy-950">Reset your password</h1><p className="mt-2 text-sm text-ink-soft">Choose your workspace and we’ll email a one-time recovery link.</p><ForgotPasswordForm defaultType={defaultType} /><p className="mt-6 text-center text-xs"><Link href="/" className="text-ink-faint hover:text-gold-700">← Back to JDL Core</Link></p></div></main>;
}

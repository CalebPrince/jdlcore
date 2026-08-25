import Link from "next/link";
import { ResetPasswordForm } from "@/components/account/recovery-forms";

export const metadata = { title: "Choose New Password | JDL Core" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return <main className="grid min-h-screen place-items-center bg-navy-950 px-4 py-14"><div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-gold-700">Secure password reset</p><h1 className="mt-3 font-display text-2xl font-bold text-navy-950">Choose a new password</h1><p className="mt-2 text-sm text-ink-soft">Use at least eight characters. This link can be used only once.</p>{token ? <ResetPasswordForm token={token} /> : <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">This reset link is incomplete. Request a new one.</div>}<p className="mt-6 text-center text-xs"><Link href="/account/forgot-password" className="text-ink-faint hover:text-gold-700">Request another link</Link></p></div></main>;
}

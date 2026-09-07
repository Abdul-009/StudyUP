import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import ChangePasswordForm from "@/app/settings/ChangePasswordForm";

// Landing point after a password-reset email link: /auth/callback exchanges
// the emailed code for a session (a Supabase "recovery" session) and sends
// the user here rather than to the general Settings page, so this flow has
// its own focused "you're here to set a new password" screen instead of
// dropping them into the whole app.
export default async function ResetPasswordPage() {
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    // No session means this wasn't reached via a valid reset link (expired,
    // already used, or visited directly) — send them to request a fresh one.
    redirect("/forgot-password");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="StudyUp" width={148} height={34} className="mb-6 h-[34px] w-auto" />
      <div className="w-full space-y-4 rounded-[20px] border border-border bg-surface p-6 sm:p-7">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground">Set a new password</h1>
          <p className="mt-1 text-sm text-muted">Choose a new password for your account.</p>
        </div>

        <ChangePasswordForm redirectTo="/home" />

        <Link href="/home" className="block text-sm text-muted hover:text-brand">
          Skip for now
        </Link>
      </div>
    </main>
  );
}

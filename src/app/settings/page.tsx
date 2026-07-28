import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { updateNotificationPreferences } from "./actions";
import ChangePasswordForm from "./ChangePasswordForm";
import LogoutButton from "./LogoutButton";

const NOTIF_TYPES = ["NEW_MESSAGE", "NEW_ASSIGNMENT", "POLL_UPDATE", "ANNOUNCEMENT"] as const;

const NOTIF_TYPE_LABELS: Record<(typeof NOTIF_TYPES)[number], string> = {
  NEW_MESSAGE: "New chat messages",
  NEW_ASSIGNMENT: "New assignments",
  POLL_UPDATE: "Poll updates",
  ANNOUNCEMENT: "Announcements",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: preferenceRows } = await supabase
    .from("NotificationPreference")
    .select("type, enabled")
    .eq("userId", user.id);

  const preferenceMap = Object.fromEntries((preferenceRows ?? []).map((row) => [row.type, row.enabled]));

  return (
    <main className="max-w-[720px] px-11 py-9">
      <div className="mb-7">
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage notifications, security, and your session.</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Notification preferences</h2>
        <form action={updateNotificationPreferences} className="mt-4 space-y-3">
          {NOTIF_TYPES.map((type) => (
            <label
              key={type}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-recessed p-3 text-sm text-foreground"
            >
              {NOTIF_TYPE_LABELS[type]}
              <input type="checkbox" name={type} defaultChecked={preferenceMap[type] ?? true} className="h-4 w-4" />
            </label>
          ))}
          <button className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">Save preferences</button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Change password</h2>
        <ChangePasswordForm />
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Session</h2>
        <p className="mt-2 text-sm text-muted">Sign out of your account on this device.</p>
        <div className="mt-4">
          <LogoutButton />
        </div>
      </section>
    </main>
  );
}

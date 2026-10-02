import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import NotificationPreferencesForm from "./NotificationPreferencesForm";
import ChangePasswordForm from "./ChangePasswordForm";
import LogoutButton from "./LogoutButton";
import PushToggle from "@/components/PushToggle";

const NOTIF_TYPES = ["NEW_MESSAGE", "NEW_ASSIGNMENT", "POLL_UPDATE", "ANNOUNCEMENT"] as const;

const NOTIF_TYPE_LABELS: Record<(typeof NOTIF_TYPES)[number], string> = {
  NEW_MESSAGE: "New chat messages",
  NEW_ASSIGNMENT: "New assignments",
  POLL_UPDATE: "Poll updates",
  ANNOUNCEMENT: "Announcements",
};

export const metadata = { title: "Settings" };

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
    <main className="max-w-[720px] px-4 py-6 md:px-11 md:py-9">
      <div className="mb-7">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage notifications, security, and your session.</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Notification preferences</h2>
        <NotificationPreferencesForm
          options={NOTIF_TYPES.map((type) => ({
            type,
            label: NOTIF_TYPE_LABELS[type],
            enabled: preferenceMap[type] ?? true,
          }))}
        />
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Device notifications</h2>
        <PushToggle />
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

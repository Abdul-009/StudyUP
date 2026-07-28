import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { markNotificationAsRead } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  NEW_MESSAGE: "New message",
  NEW_ASSIGNMENT: "New assignment",
  POLL_UPDATE: "Poll update",
  ANNOUNCEMENT: "Announcement",
};

const TYPE_COLORS: Record<string, string> = {
  NEW_MESSAGE: "var(--color-coral)",
  NEW_ASSIGNMENT: "var(--color-sage)",
  POLL_UPDATE: "var(--color-sunflower)",
  ANNOUNCEMENT: "var(--color-teal)",
};

type NotificationRecord = {
  id: string;
  type: string;
  groupId: string | null;
  refId: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
};

function NotificationRow({ notification }: { notification: NotificationRecord }) {
  const accentColor = TYPE_COLORS[notification.type] || "var(--color-indigo)";

  return (
    <form action={markNotificationAsRead}>
      <input type="hidden" name="notificationId" value={notification.id} />
      <button
        type="submit"
        className="flex w-full items-center gap-4 rounded-xl border border-border border-l-4 bg-surface px-5 py-4 text-left"
        style={{ borderLeftColor: accentColor }}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-foreground">
            {TYPE_LABELS[notification.type] || notification.type}
          </h3>
          <p className="truncate text-xs text-muted">{notification.content}</p>
        </div>
        <span className="shrink-0 font-mono text-[12.5px] font-semibold text-foreground">
          {new Date(notification.createdAt).toLocaleString()}
        </span>
      </button>
    </form>
  );
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: notifications } = await supabase
    .from("Notification")
    .select("id, type, groupId, refId, content, isRead, createdAt")
    .eq("userId", user.id)
    .order("createdAt", { ascending: false });

  const list = (notifications ?? []) as NotificationRecord[];
  const unread = list.filter((notification) => !notification.isRead);
  const read = list.filter((notification) => notification.isRead);

  return (
    <main className="max-w-[720px] px-11 py-9">
      <div className="mb-7">
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-muted">{unread.length} unread</p>
      </div>

      <section>
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
          Unread
        </h2>
        <div className="space-y-2.5">
          {unread.length ? (
            unread.map((notification) => <NotificationRow key={notification.id} notification={notification} />)
          ) : (
            <p className="text-sm text-muted">You&apos;re all caught up.</p>
          )}
        </div>
      </section>

      <section className="mt-7">
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
          Read
        </h2>
        <div className="space-y-2.5">
          {read.length ? (
            read.map((notification) => <NotificationRow key={notification.id} notification={notification} />)
          ) : (
            <p className="text-sm text-muted">No read notifications yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}

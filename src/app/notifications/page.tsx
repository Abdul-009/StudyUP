import { redirect } from "next/navigation";
import { BellOff } from "lucide-react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { markNotificationAsRead, markAllNotificationsAsRead, clearAllNotifications } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  NEW_MESSAGE: "New message",
  NEW_ASSIGNMENT: "New assignment",
  POLL_UPDATE: "Poll update",
  ANNOUNCEMENT: "Announcement",
  MENTION: "You were mentioned",
  ASSIGNMENT_REMINDER: "Assignment due soon",
};

const TYPE_COLORS: Record<string, string> = {
  NEW_MESSAGE: "var(--color-coral)",
  NEW_ASSIGNMENT: "var(--color-sage)",
  POLL_UPDATE: "var(--color-sunflower)",
  ANNOUNCEMENT: "var(--color-teal)",
  MENTION: "var(--color-plum)",
  ASSIGNMENT_REMINDER: "var(--color-coral)",
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
        className={`flex w-full items-center gap-4 rounded-xl border border-l-4 px-5 py-4 text-left transition-colors ${
          notification.isRead
            ? "border-border bg-surface-recessed opacity-75 hover:opacity-100"
            : "border-border bg-surface hover:bg-border"
        }`}
        style={{ borderLeftColor: accentColor }}
      >
        <div className="min-w-0 flex-1">
          <h3 className={`truncate text-[15px] font-semibold ${notification.isRead ? "text-muted" : "text-foreground"}`}>
            {TYPE_LABELS[notification.type] || notification.type}
          </h3>
          <p className="truncate text-xs text-muted">{notification.content}</p>
        </div>
        <span className="shrink-0 font-mono text-[12.5px] font-semibold text-muted">
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
    <main className="max-w-[720px] px-4 py-6 md:px-11 md:py-9">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">Notifications</h1>
          <p className="mt-1 text-sm text-muted">{unread.length} unread</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unread.length > 0 ? (
            <form action={markAllNotificationsAsRead}>
              <button
                type="submit"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
              >
                Mark all as read
              </button>
            </form>
          ) : null}
          {list.length > 0 ? (
            <form action={clearAllNotifications}>
              <button
                type="submit"
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted hover:bg-border hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <BellOff size={32} className="text-muted opacity-60" />
          <p className="text-sm font-medium text-foreground">Nothing here yet</p>
          <p className="text-xs text-muted">
            You&apos;ll see mentions, new messages, assignments, and other updates here.
          </p>
        </div>
      ) : (
        <>
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
        </>
      )}
    </main>
  );
}

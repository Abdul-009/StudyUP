import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAnnouncement } from "./actions";

type AnnouncementRecord = {
  id: string;
  content: string;
  createdAt: string;
  postedBy: string;
  poster: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export default async function GroupAnnouncementsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("GroupMember")
    .select("role")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/home");
  }

  const { data: announcements } = await supabase
    .from("Announcement")
    .select("id, content, createdAt, postedBy")
    .eq("groupId", groupId)
    .order("createdAt", { ascending: false });

  const posterIds = Array.from(new Set((announcements ?? []).map((announcement) => announcement.postedBy)));
  let posterMap: Record<string, { id: string; name: string; email: string }> = {};

  if (posterIds.length) {
    const { data: users } = await supabase.from("User").select("id, name, email").in("id", posterIds);
    posterMap = Object.fromEntries((users ?? []).map((userRow) => [userRow.id, userRow]));
  }

  const announcementList: AnnouncementRecord[] = (announcements ?? []).map((announcement) => ({
    id: announcement.id,
    content: announcement.content,
    createdAt: announcement.createdAt,
    postedBy: announcement.postedBy,
    poster: posterMap[announcement.postedBy] ?? null,
  }));

  return (
    <main className="max-w-[820px] px-4 py-6 md:px-11 md:py-9">
      <div className="mb-7">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">Announcements</h1>
        <p className="mt-1 text-sm text-muted">Share updates with the group and keep everyone informed.</p>
      </div>

      {membership.role === "ADMIN" ? (
        <section className="mb-6 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold text-foreground">Post an announcement</h2>
          <form action={async (formData: FormData) => {
            "use server";
            await createAnnouncement(groupId, String(formData.get("content") || ""));
          }} className="mt-4 space-y-3">
            <textarea name="content" rows={4} required className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground" />
            <button className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">Post</button>
          </form>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Recent announcements</h2>
        <div className="mt-4 space-y-3">
          {announcementList.length ? (
            announcementList.map((announcement) => (
              <div key={announcement.id} className="rounded-xl border border-border bg-surface-recessed p-4">
                <div className="flex items-center justify-between gap-2 text-sm text-muted">
                  <span>{announcement.poster?.name || "Unknown"}</span>
                  <span className="font-mono text-xs">{new Date(announcement.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-foreground">{announcement.content}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">No announcements yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}

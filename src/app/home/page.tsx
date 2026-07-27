import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { joinGroupFromForm } from "./actions";
import CreateGroupModal from "./CreateGroupModal";
import PublicGroupsSearch from "./PublicGroupsSearch";

const PUBLIC_GROUPS_PAGE_SIZE = 5;

type AvatarMember = { id: string; name: string; profilePicUrl: string | null };

type GroupCard = {
  id: string;
  name: string;
  description: string | null;
  accentColor: string;
  avatarMembers: AvatarMember[];
  lastMessage: { content: string; createdAt: string } | null;
  hasUnread: boolean;
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatPreviewTime(iso: string) {
  const date = new Date(iso);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function AvatarStack({ members }: { members: AvatarMember[] }) {
  const shown = members.slice(0, 3);
  const overflow = members.length - shown.length;

  return (
    <div className="flex -space-x-2">
      {shown.map((member) =>
        member.profilePicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={member.id}
            src={member.profilePicUrl}
            alt={member.name}
            className="h-[26px] w-[26px] rounded-full border-2 border-white object-cover"
          />
        ) : (
          <div
            key={member.id}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white bg-surface-recessed text-[10.5px] font-medium text-muted"
          >
            {member.name.charAt(0).toUpperCase()}
          </div>
        ),
      )}
      {overflow > 0 ? (
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white bg-foreground text-[10.5px] font-medium text-background">
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const search = typeof resolvedSearchParams.search === "string" ? resolvedSearchParams.search : "";

  const { data: myMemberships } = await supabase
    .from("GroupMember")
    .select("groupId, lastSeenAt")
    .eq("userId", user.id);

  const groupIds = (myMemberships ?? []).map((row) => row.groupId);
  const lastSeenByGroup: Record<string, string | null> = Object.fromEntries(
    (myMemberships ?? []).map((row) => [row.groupId, row.lastSeenAt]),
  );

  const { data: joinedGroups } = await supabase
    .from("Group")
    .select("id, name, description, accentColor")
    .in("id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: allMemberRows } = await supabase
    .from("GroupMember")
    .select("groupId, userId")
    .in("groupId", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"]);

  const memberUserIds = Array.from(new Set((allMemberRows ?? []).map((row) => row.userId)));
  let userMap: Record<string, AvatarMember> = {};

  if (memberUserIds.length) {
    const { data: users } = await supabase.from("User").select("id, name, profilePicUrl").in("id", memberUserIds);
    userMap = Object.fromEntries((users ?? []).map((row) => [row.id, row]));
  }

  const { data: recentMessages } = await supabase
    .from("Message")
    .select("groupId, content, createdAt")
    .in("groupId", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"])
    .order("createdAt", { ascending: false });

  const lastMessageByGroup: Record<string, { content: string; createdAt: string }> = {};
  for (const message of recentMessages ?? []) {
    if (!lastMessageByGroup[message.groupId]) {
      lastMessageByGroup[message.groupId] = { content: message.content, createdAt: message.createdAt };
    }
  }

  const unreadGroupCount = (joinedGroups ?? []).filter((group) => {
    const lastMessage = lastMessageByGroup[group.id];
    const lastSeenAt = lastSeenByGroup[group.id];
    return Boolean(lastMessage && (!lastSeenAt || new Date(lastMessage.createdAt).getTime() > new Date(lastSeenAt).getTime()));
  }).length;

  const groupCards: GroupCard[] = (joinedGroups ?? []).map((group) => {
    const members = (allMemberRows ?? []).filter((row) => row.groupId === group.id);
    const lastMessage = lastMessageByGroup[group.id] ?? null;
    const lastSeenAt = lastSeenByGroup[group.id];
    const hasUnread = Boolean(
      lastMessage && (!lastSeenAt || new Date(lastMessage.createdAt).getTime() > new Date(lastSeenAt).getTime()),
    );

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      accentColor: group.accentColor,
      avatarMembers: members.map((row) => userMap[row.userId]).filter((member): member is AvatarMember => Boolean(member)),
      lastMessage,
      hasUnread,
    };
  });

  let publicGroupsQuery = supabase
    .from("Group")
    .select("id, name, description")
    .eq("isPrivate", false)
    .neq("createdBy", user.id)
    .ilike("name", `%${search}%`)
    .order("createdAt", { ascending: false })
    .range(0, PUBLIC_GROUPS_PAGE_SIZE - 1);

  let publicGroupsCountQuery = supabase
    .from("Group")
    .select("id", { count: "exact", head: true })
    .eq("isPrivate", false)
    .neq("createdBy", user.id)
    .ilike("name", `%${search}%`);

  if (groupIds.length) {
    publicGroupsQuery = publicGroupsQuery.not("id", "in", `(${groupIds.join(",")})`);
    publicGroupsCountQuery = publicGroupsCountQuery.not("id", "in", `(${groupIds.join(",")})`);
  }

  const { data: publicGroups } = await publicGroupsQuery;
  const { count: publicGroupsCount } = await publicGroupsCountQuery;

  const { data: privateGroups } = await supabase
    .from("Group")
    .select("id, name, description")
    .eq("isPrivate", true)
    .neq("createdBy", user.id);

  const joinedGroupIds = new Set(groupIds);
  const visiblePrivateGroups = (privateGroups ?? []).filter((group) => !joinedGroupIds.has(group.id));

  return (
    <main className="max-w-[920px] px-4 py-6 md:px-11 md:py-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">Your study groups</h1>
          <p className="mt-1 text-sm text-muted">
            {groupCards.length} group{groupCards.length === 1 ? "" : "s"}
            {unreadGroupCount > 0 ? ` · ${unreadGroupCount} with unread messages` : ""}
          </p>
        </div>
        <CreateGroupModal variant="button" />
      </div>

      <form method="get" className="mt-6 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-[11px]">
        <Search size={18} className="shrink-0 text-muted" />
        <input
          name="search"
          defaultValue={search}
          placeholder="Search groups by name or course code"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        <button className="rounded-[10px] border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-recessed">
          Search
        </button>
      </form>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {groupCards.map((group) => (
          <Link
            key={group.id}
            href={`/groups/${group.id}/chat`}
            className="flex min-h-[190px] flex-col justify-between gap-3 rounded-[20px] border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_6px_18px_rgba(30,33,48,0.08)]"
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[16px] font-heading text-[17px] font-bold text-white"
                style={{ backgroundColor: group.accentColor }}
              >
                {getInitials(group.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[17px] font-bold tracking-[-0.01em] text-foreground">{group.name}</h3>
                  {group.hasUnread ? (
                    <span className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-coral" />
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] leading-[1.4] text-muted">
                  {group.description || "No description yet."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
              <AvatarStack members={group.avatarMembers} />
              {group.lastMessage ? (
                <span className="font-mono text-[12.5px] text-muted">
                  {formatPreviewTime(group.lastMessage.createdAt)}
                </span>
              ) : null}
            </div>

            <p className="truncate text-[12.5px] text-muted">
              {group.lastMessage ? group.lastMessage.content : "No messages yet."}
            </p>
          </Link>
        ))}

        <CreateGroupModal variant="card" />
      </div>

      <section className="mt-8 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-xl font-semibold text-foreground">Discover groups</h2>
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-foreground">Public groups</h3>
            <PublicGroupsSearch search={search} initialGroups={publicGroups ?? []} totalCount={publicGroupsCount ?? 0} />
          </div>

          <div>
            <h3 className="text-lg font-medium text-foreground">Private groups</h3>
            <div className="mt-3 space-y-3">
              {visiblePrivateGroups.length ? (
                visiblePrivateGroups.map((group) => (
                  <div key={group.id} className="rounded-lg border border-border bg-surface-recessed p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-medium text-foreground">{group.name}</h4>
                        <p className="text-sm text-muted">{group.description || "No description yet."}</p>
                      </div>
                      <form action={joinGroupFromForm} className="flex items-center gap-2">
                        <input type="hidden" name="groupId" value={group.id} />
                        <input
                          name="inviteCode"
                          placeholder="Invite code"
                          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                        />
                        <button className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">
                          Join
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No private groups are available to join right now.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

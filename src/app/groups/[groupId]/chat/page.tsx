import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import ChatLayout from "./ChatLayout";

type MessageRecord = {
  id: string;
  groupId: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
};

type MemberRecord = {
  id: string;
  userId: string;
  role: "ADMIN" | "MEMBER";
  user: {
    id: string;
    name: string;
    email: string;
    profilePicUrl: string | null;
  } | null;
};

export default async function GroupChatPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/home");
  }

  const { data: group } = await supabase.from("Group").select("id, name, accentColor").eq("id", groupId).single();
  if (!group) {
    redirect("/home");
  }

  // Mark this group as seen by the current user, for the home page's unread indicator.
  await supabase
    .from("GroupMember")
    .update({ lastSeenAt: new Date().toISOString() })
    .eq("groupId", groupId)
    .eq("userId", user.id);

  // Sidebar: every group this user belongs to, plus each one's latest message preview
  const { data: userMemberships } = await supabase.from("GroupMember").select("groupId").eq("userId", user.id);
  const sidebarGroupIds = Array.from(new Set((userMemberships ?? []).map((row) => row.groupId)));

  const { data: sidebarGroupRows } = await supabase
    .from("Group")
    .select("id, name, accentColor")
    .in("id", sidebarGroupIds.length ? sidebarGroupIds : ["00000000-0000-0000-0000-000000000000"])
    .order("name", { ascending: true });

  const { data: recentMessages } = await supabase
    .from("Message")
    .select("groupId, content, createdAt")
    .in("groupId", sidebarGroupIds.length ? sidebarGroupIds : ["00000000-0000-0000-0000-000000000000"])
    .order("createdAt", { ascending: false });

  const lastMessageByGroup: Record<string, { content: string; createdAt: string }> = {};
  for (const message of recentMessages ?? []) {
    if (!lastMessageByGroup[message.groupId]) {
      lastMessageByGroup[message.groupId] = { content: message.content, createdAt: message.createdAt };
    }
  }

  const sidebarGroups = (sidebarGroupRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    accentColor: row.accentColor,
    lastMessage: lastMessageByGroup[row.id] ?? null,
  }));

  const { data: messages } = await supabase
    .from("Message")
    .select("id, groupId, userId, content, createdAt, editedAt")
    .eq("groupId", groupId)
    .order("createdAt", { ascending: true });

  const { data: memberRows } = await supabase
    .from("GroupMember")
    .select("id, userId, role")
    .eq("groupId", groupId)
    .order("role", { ascending: false });

  const userIds = Array.from(new Set((memberRows ?? []).map((row) => row.userId)));
  let userMap: Record<string, { id: string; name: string; email: string; profilePicUrl: string | null }> = {};

  if (userIds.length) {
    const { data: users } = await supabase.from("User").select("id, name, email, profilePicUrl").in("id", userIds);
    userMap = Object.fromEntries((users ?? []).map((userRow) => [userRow.id, userRow]));
  }

  const members: MemberRecord[] = (memberRows ?? []).map((row) => ({
    id: row.id,
    userId: row.userId,
    role: row.role as "ADMIN" | "MEMBER",
    user: userMap[row.userId] ?? null,
  }));

  return (
    <main className="flex flex-1 flex-col px-4 py-6 md:px-11 md:py-9">
      <div className="mb-4 flex items-end justify-between gap-4 md:mb-7">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">Group Chat</h1>
          <p className="mt-1 text-sm text-muted">{group.name}</p>
        </div>
      </div>
      <ChatLayout
        sidebarGroups={sidebarGroups}
        activeGroupId={groupId}
        groupId={groupId}
        groupName={group.name}
        groupColor={group.accentColor}
        currentUserId={user.id}
        initialMessages={(messages ?? []) as MessageRecord[]}
        initialMembers={members}
      />
    </main>
  );
}

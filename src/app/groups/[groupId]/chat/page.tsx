import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { MESSAGE_PAGE_SIZE, encodeMessageCursor } from "@/lib/messages-pagination";
import { fetchLastGroupMessages } from "@/lib/last-messages";
import { assignGroupColors, resolveGroupColor } from "@/lib/groupColors";
import ChatLayout from "./ChatLayout";

type MessageRecord = {
  id: string;
  groupId: string;
  userId: string;
  content: string | null;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  replyToId: string | null;
  mentionedUserIds: string[];
  attachmentUrl: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  replyTo?: {
    id: string;
    content: string | null;
    isDeleted: boolean;
    user?: {
      name: string;
    };
  } | null;
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
    lastSeenAt: string | null;
  } | null;
};

const NO_GROUPS_PLACEHOLDER = ["00000000-0000-0000-0000-000000000000"];

export const metadata = { title: "Group chat" };

export default async function GroupChatPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  // Wave 1: everything that only needs groupId / user.id. Row-level access is
  // enforced by the membership check below, which redirects before anything
  // from the other results is used.
  const [
    { data: membership },
    { data: group },
    { data: userMemberships },
    { data: pageRows },
    { data: memberRows },
  ] = await Promise.all([
    supabase.from("GroupMember").select("id").eq("groupId", groupId).eq("userId", user.id).maybeSingle(),
    supabase.from("Group").select("id, name, accentColor").eq("id", groupId).maybeSingle(),
    supabase.from("GroupMember").select("groupId").eq("userId", user.id),
    // Only the most recent page loads up front; older history is paged in on
    // scroll via `fetchGroupMessages`. One extra row tells us whether a page
    // before this one exists.
    supabase
      .from("Message")
      .select(
        "id, groupId, userId, content, createdAt, editedAt, isEdited, isDeleted, deletedAt, replyToId, mentionedUserIds, attachmentUrl, attachmentType, attachmentName, attachmentSize",
      )
      .eq("groupId", groupId)
      .order("createdAt", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1),
    supabase.from("GroupMember").select("id, userId, role").eq("groupId", groupId).order("role", { ascending: false }),
  ]);

  if (!membership || !group) {
    redirect("/home");
  }

  const initialHasMore = (pageRows ?? []).length > MESSAGE_PAGE_SIZE;
  // Client renders oldest-first; the query came back newest-first.
  const messages = (pageRows ?? []).slice(0, MESSAGE_PAGE_SIZE).reverse();
  const initialCursor =
    initialHasMore && messages.length
      ? encodeMessageCursor({ createdAt: messages[0].createdAt, id: messages[0].id })
      : null;

  const sidebarGroupIds = Array.from(new Set((userMemberships ?? []).map((row) => row.groupId)));
  const userIds = Array.from(new Set((memberRows ?? []).map((row) => row.userId)));
  const replyToIds = Array.from(
    new Set(messages.map((msg) => msg.replyToId).filter((id): id is string => !!id)),
  );
  const threadMessageIds = messages.map((msg) => msg.id);
  const now = new Date().toISOString();

  // Wave 2: lookups that depend on wave-1 results, plus the "I've seen this
  // group" bookkeeping, all in parallel instead of one after another.
  const [
    { data: sidebarGroupRows },
    lastMessageByGroup,
    { data: users },
    { data: replyTos },
    { data: readRows },
  ] = await Promise.all([
    supabase
      .from("Group")
      .select("id, name, accentColor")
      .in("id", sidebarGroupIds.length ? sidebarGroupIds : NO_GROUPS_PLACEHOLDER)
      .order("name", { ascending: true }),
    fetchLastGroupMessages(supabase, sidebarGroupIds),
    userIds.length
      ? supabase.from("User").select("id, name, email, profilePicUrl, lastSeenAt").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string; profilePicUrl: string | null; lastSeenAt: string | null }[] }),
    replyToIds.length
      ? supabase.from("Message").select("id, content, isDeleted, userId").in("id", replyToIds)
      : Promise.resolve({ data: [] as { id: string; content: string | null; isDeleted: boolean; userId: string }[] }),
    threadMessageIds.length
      ? supabase.from("MessageRead").select("messageId, userId").in("messageId", threadMessageIds)
      : Promise.resolve({ data: [] as { messageId: string; userId: string }[] }),
    // Home page's unread dot.
    supabase.from("GroupMember").update({ lastSeenAt: now }).eq("groupId", groupId).eq("userId", user.id),
    // Opening the chat is "seeing" its message notifications; otherwise the
    // bell badge only ever grows.
    supabase
      .from("Notification")
      .update({ isRead: true, readAt: now })
      .eq("userId", user.id)
      .eq("groupId", groupId)
      .in("type", ["NEW_MESSAGE", "MENTION"])
      .eq("isRead", false),
  ]);

  const groupColors = assignGroupColors(sidebarGroupRows ?? []);

  const sidebarGroups = (sidebarGroupRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    accentColor: groupColors[row.id] ?? resolveGroupColor(row.id, row.accentColor),
    lastMessage: lastMessageByGroup[row.id] ?? null,
  }));

  const userMap = Object.fromEntries((users ?? []).map((userRow) => [userRow.id, userRow]));

  const members: MemberRecord[] = (memberRows ?? []).map((row) => ({
    id: row.id,
    userId: row.userId,
    role: row.role as "ADMIN" | "MEMBER",
    user: userMap[row.userId] ?? null,
  }));

  const replyToMessages: Record<string, { id: string; content: string | null; isDeleted: boolean; user?: { name: string } }> = {};
  for (const msg of replyTos ?? []) {
    const sender = members.find((m) => m.userId === msg.userId);
    replyToMessages[msg.id] = {
      id: msg.id,
      content: msg.content,
      isDeleted: msg.isDeleted,
      user: sender?.user ?? undefined,
    };
  }

  const messagesWithReplies = messages.map((msg) => ({
    ...msg,
    replyTo: msg.replyToId ? replyToMessages[msg.replyToId] : null,
  })) as MessageRecord[];

  return (
    <main className="flex min-h-0 flex-1 flex-col px-4 py-3 md:px-11 md:py-6">
      <div className="mb-4 hidden items-end justify-between gap-4 md:flex">
        <div>
          <h1 className="text-[32px] font-bold tracking-[-0.02em] text-foreground">Group Chat</h1>
          <p className="mt-1 text-sm text-muted">{group.name}</p>
        </div>
      </div>
      <ChatLayout
        sidebarGroups={sidebarGroups}
        activeGroupId={groupId}
        groupId={groupId}
        groupName={group.name}
        groupColor={groupColors[group.id] ?? resolveGroupColor(group.id, group.accentColor)}
        currentUserId={user.id}
        initialMessages={messagesWithReplies}
        initialMembers={members}
        initialReads={readRows ?? []}
        initialHasMore={initialHasMore}
        initialCursor={initialCursor}
      />
    </main>
  );
}

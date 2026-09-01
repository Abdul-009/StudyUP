import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import DMThread from "./DMThread";

type DirectMessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  replyToId: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  profilePicUrl: string | null;
};

export default async function DMThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await getAuthUser();

  if (authError || !user) {
    redirect("/login");
  }

  // Verify user has access to this conversation
  const { data: conversation, error: convError } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    redirect("/messages");
  }

  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    redirect("/messages");
  }

  const otherId = conversation.userAId === user.id ? conversation.userBId : conversation.userAId;

  // The Supabase auth user object has no `name` — names live in the User table,
  // so fetch both participants' names here for the reply-quote sender labels.
  const { data: participantRows } = await supabase
    .from("User")
    .select("id, name, email, profilePicUrl")
    .in("id", [user.id, otherId]);

  const otherUser = participantRows?.find((u) => u.id === otherId) ?? null;
  const currentUserName = participantRows?.find((u) => u.id === user.id)?.name ?? "You";

  // Fetch messages
  const { data: messages } = await supabase
    .from("DirectMessage")
    .select("id, conversationId, senderId, content, replyToId, isDeleted, deletedAt, createdAt")
    .eq("conversationId", conversationId)
    .order("createdAt", { ascending: true });

  // Fetch replyTo messages
  const replyToIds = new Set<string>();
  if (messages) {
    for (const msg of messages) {
      if (msg.replyToId) {
        replyToIds.add(msg.replyToId);
      }
    }
  }

  const replyToMessages: Record<
    string,
    {
      id: string;
      content: string | null;
      isDeleted: boolean;
      senderId: string;
      senderName: string;
    }
  > = {};

  if (replyToIds.size > 0) {
    const { data: replyTos } = await supabase
      .from("DirectMessage")
      .select("id, content, isDeleted, senderId")
      .in("id", Array.from(replyToIds));

    if (replyTos) {
      for (const msg of replyTos) {
        const sender = msg.senderId === user.id ? currentUserName : otherUser?.name || "Unknown";
        replyToMessages[msg.id] = {
          id: msg.id,
          content: msg.content,
          isDeleted: msg.isDeleted,
          senderId: msg.senderId,
          senderName: sender,
        };
      }
    }
  }

  // Augment messages with replyTo data
  const messagesWithReplies = (messages || []).map((msg) => ({
    ...msg,
    replyTo: msg.replyToId ? replyToMessages[msg.replyToId] : null,
  }));

  return (
    <main className="flex flex-1 flex-col px-4 py-6 md:px-11 md:py-9">
      <DMThread
        conversationId={conversationId}
        currentUserId={user.id}
        currentUserName={currentUserName}
        otherUser={otherUser}
        initialMessages={messagesWithReplies}
      />
    </main>
  );
}

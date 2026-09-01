import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { getOrCreateDirectConversation } from "@/lib/dm-actions";

type ConversationRow = {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  profilePicUrl: string | null;
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams?: Promise<{ start?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  const resolvedParams = (await searchParams) ?? {};
  const startUserId = typeof resolvedParams.start === "string" ? resolvedParams.start : null;

  // If start user ID is provided, create/get conversation and redirect.
  // NOTE: redirect() throws a NEXT_REDIRECT control-flow error, so it must run
  // OUTSIDE the try/catch — otherwise the catch swallows the redirect and the
  // user silently stays on the list after the first "Message" tap.
  let startConversationId: string | null = null;
  let startError: string | null = null;
  if (startUserId && startUserId !== user.id) {
    try {
      const conversation = await getOrCreateDirectConversation(user.id, startUserId);
      startConversationId = conversation.id;
    } catch (err) {
      // e.g. the two users share no group — fall through to the list with a notice
      startError = err instanceof Error ? err.message : "Couldn't start that conversation.";
      console.error("Failed to create conversation:", err);
    }
  }

  if (startConversationId) {
    redirect(`/messages/${startConversationId}`);
  }

  const { data: conversations } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId, createdAt")
    .or(`userAId.eq.${user.id},userBId.eq.${user.id}`)
    .order("createdAt", { ascending: false });

  // Get the other user info for each conversation
  const otherUserIds = new Set<string>();
  for (const conv of conversations || []) {
    const otherId = conv.userAId === user.id ? conv.userBId : conv.userAId;
    otherUserIds.add(otherId);
  }

  let userMap: Record<string, UserRow> = {};
  if (otherUserIds.size > 0) {
    const { data: users } = await supabase
      .from("User")
      .select("id, name, email, profilePicUrl")
      .in("id", Array.from(otherUserIds));

    userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-6 md:px-11 md:py-9">
      <div className="mb-6 flex items-center gap-2">
        <MessageSquare size={28} className="text-ink" />
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">
          Messages
        </h1>
      </div>

      <div className="w-full max-w-2xl">
        {startError ? (
          <p className="mb-4 rounded-lg bg-coral-tint p-3 text-sm text-coral">{startError}</p>
        ) : null}
        {conversations && conversations.length > 0 ? (
          <div className="space-y-2">
            {conversations.map((conv) => {
              const otherId = conv.userAId === user.id ? conv.userBId : conv.userAId;
              const otherUser = userMap[otherId];

              return (
                <Link
                  key={conv.id}
                  href={`/messages/${conv.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-recessed"
                >
                  {otherUser?.profilePicUrl ? (
                    <img
                      src={otherUser.profilePicUrl}
                      alt={otherUser.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-plum font-heading text-sm font-semibold text-white">
                      {(otherUser?.name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{otherUser?.name || "Unknown User"}</p>
                    <p className="text-sm text-muted">{otherUser?.email}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {new Date(conv.createdAt).toLocaleDateString()}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <MessageSquare size={48} className="mx-auto mb-3 text-muted opacity-50" />
            <p className="text-sm text-muted">No conversations yet</p>
            <p className="text-xs text-muted">Start a conversation by clicking Message on a group member</p>
          </div>
        )}
      </div>
    </main>
  );
}

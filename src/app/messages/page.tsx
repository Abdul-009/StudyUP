import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { getOrCreateDirectConversation } from "@/lib/dm-actions";
import { fetchLastDirectMessages } from "@/lib/last-messages";
import LocalTime from "@/components/LocalTime";

type UserRow = {
  id: string;
  name: string;
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
    .select("id, userAId, userBId")
    .or(`userAId.eq.${user.id},userBId.eq.${user.id}`);

  const conversationIds = (conversations ?? []).map((conv) => conv.id);
  const otherUserIds = Array.from(
    new Set((conversations ?? []).map((conv) => (conv.userAId === user.id ? conv.userBId : conv.userAId))),
  );

  const [lastByConversation, { data: users }, { data: unreadRows }] = await Promise.all([
    fetchLastDirectMessages(supabase, conversationIds),
    otherUserIds.length
      ? supabase.from("User").select("id, name, profilePicUrl").in("id", otherUserIds)
      : Promise.resolve({ data: [] as UserRow[] }),
    supabase
      .from("Notification")
      .select("refId")
      .eq("userId", user.id)
      .eq("type", "NEW_MESSAGE")
      .is("groupId", null)
      .eq("isRead", false),
  ]);

  const userMap: Record<string, UserRow> = Object.fromEntries((users ?? []).map((u) => [u.id, u]));
  const unreadConversationIds = new Set((unreadRows ?? []).map((row) => row.refId));

  // A conversation only appears once someone has actually sent a message.
  // Tapping "Message" on a member creates the thread so it can be opened, but
  // an empty one shouldn't show up in the other person's list as a ghost entry.
  const rows = (conversations ?? [])
    .filter((conv) => lastByConversation[conv.id])
    .map((conv) => ({
      conv,
      last: lastByConversation[conv.id],
      otherUser: userMap[conv.userAId === user.id ? conv.userBId : conv.userAId],
    }))
    .sort((a, b) => new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime());

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
        {rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map(({ conv, last, otherUser }) => {
              const unread = unreadConversationIds.has(conv.id);
              return (
                <Link
                  key={conv.id}
                  href={`/messages/${conv.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-recessed"
                >
                  {otherUser?.profilePicUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={otherUser.profilePicUrl}
                      alt={otherUser.name}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-plum font-heading text-sm font-semibold text-white">
                      {(otherUser?.name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-foreground ${unread ? "font-bold" : "font-semibold"}`}>
                      {otherUser?.name || "Unknown User"}
                    </p>
                    <p className={`truncate text-sm ${unread ? "font-medium text-foreground" : "text-muted"}`}>
                      {last.senderId === user.id ? "You: " : ""}
                      {last.content}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <p className="text-xs text-muted">
                      <LocalTime iso={last.createdAt} variant="preview" />
                    </p>
                    {unread ? <span className="h-2.5 w-2.5 rounded-full bg-coral" aria-label="Unread" /> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <MessageSquare size={48} className="mx-auto mb-3 text-muted opacity-50" />
            <p className="text-sm font-medium text-foreground">No conversations yet</p>
            <p className="mt-1 text-xs text-muted">
              Open a group chat, tap the member avatars, then the message icon next to someone to start one.
            </p>
            <Link
              href="/home"
              className="mt-4 inline-block rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
            >
              Go to your groups
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

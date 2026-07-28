'use client';

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Paperclip, Smile } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createGroupMessage } from "./actions";

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

type GroupChatClientProps = {
  groupId: string;
  groupName: string;
  groupColor: string;
  currentUserId: string;
  initialMessages: MessageRecord[];
  initialMembers: MemberRecord[];
  onBack?: () => void;
};

function sortMessages(items: MessageRecord[]) {
  return [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Avatar({ member, size = 6.5 }: { member: MemberRecord; size?: number }) {
  const initial = (member.user?.name || member.user?.email || "?").charAt(0).toUpperCase();
  const dimension = `${size * 0.25}rem`;
  const pixelSize = size * 4;

  if (member.user?.profilePicUrl) {
    return (
      <Image
        src={member.user.profilePicUrl}
        alt={member.user.name}
        width={pixelSize}
        height={pixelSize}
        style={{ width: dimension, height: dimension }}
        className="rounded-full border-2 border-surface object-cover"
      />
    );
  }

  return (
    <div
      style={{ width: dimension, height: dimension }}
      className="flex items-center justify-center rounded-full border-2 border-surface bg-plum font-heading text-[10.5px] font-semibold text-white"
    >
      {initial}
    </div>
  );
}

export default function GroupChatClient({
  groupId,
  groupName,
  groupColor,
  currentUserId,
  initialMessages,
  initialMembers,
  onBack,
}: GroupChatClientProps) {
  const [messages, setMessages] = useState<MessageRecord[]>(() => sortMessages(initialMessages));
  const [members] = useState<MemberRecord[]>(initialMembers);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const visibleMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((message) => {
      if (seen.has(message.id)) {
        return false;
      }
      seen.add(message.id);
      return true;
    });
  }, [messages]);

  const memberMap = useMemo(
    () => Object.fromEntries(members.map((member) => [member.userId, member])),
    [members],
  );

  useEffect(() => {
    const channel = supabase.channel(`group-chat-${groupId}`);

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "Message",
        filter: `groupId=eq.${groupId}`,
      },
      (payload) => {
        const incomingMessage = payload.new as MessageRecord;
        setMessages((prev) => {
          if (prev.some((item) => item.id === incomingMessage.id)) {
            return prev;
          }
          return sortMessages([...prev, incomingMessage]);
        });
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();

    if (!trimmed || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    const optimisticMessage: MessageRecord = {
      id: `pending-${Date.now()}`,
      groupId,
      userId: currentUserId,
      content: trimmed,
      createdAt: new Date().toISOString(),
      editedAt: null,
    };

    setMessages((prev) => sortMessages([...prev, optimisticMessage]));
    setDraft("");

    try {
      const savedMessage = (await createGroupMessage(groupId, trimmed)) as MessageRecord;
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((item) => item.id !== optimisticMessage.id);
        if (withoutOptimistic.some((item) => item.id === savedMessage.id)) {
          // Realtime already delivered this insert while the action was in flight.
          return sortMessages(withoutOptimistic);
        }
        return sortMessages([...withoutOptimistic, savedMessage]);
      });
    } catch (err) {
      setMessages((prev) => prev.filter((item) => item.id !== optimisticMessage.id));
      setError(err instanceof Error ? err.message : "Unable to send message right now.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div
        className="flex items-center gap-3.5 rounded-xl border border-border bg-surface p-[14px] px-5"
        style={{ borderLeftColor: groupColor, borderLeftWidth: "4px" }}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="shrink-0 text-muted hover:text-foreground md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold text-foreground">{groupName}</h1>
          <p className="text-[12.5px] text-muted">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="ml-auto flex -space-x-2">
          {members.slice(0, 5).map((member) => (
            <Avatar key={member.id} member={member} />
          ))}
          {members.length > 5 ? (
            <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-surface bg-foreground text-[10.5px] font-medium text-background">
              +{members.length - 5}
            </div>
          ) : null}
        </div>
      </div>

      <section className="flex flex-1 flex-col rounded-xl border border-border bg-surface p-[22px]">
        <div className="flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto pr-2 md:max-h-[480px] md:flex-none">
          {visibleMessages.length ? (
            visibleMessages.map((message, index) => {
              const isOwn = message.userId === currentUserId;
              const sender = memberMap[message.userId];

              return (
                <div
                  key={`${message.id}-${index}`}
                  className={`flex max-w-[68%] gap-2.5 ${isOwn ? "ml-auto flex-row-reverse" : "flex-row"}`}
                >
                  {sender ? <Avatar member={sender} /> : null}
                  <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                    {!isOwn ? (
                      <span className="mb-[3px] px-1 text-xs font-semibold text-foreground">
                        {sender?.user?.name || "Unknown"}
                      </span>
                    ) : null}
                    <div
                      className={`rounded-2xl px-[15px] py-2.5 text-sm leading-[1.45] ${
                        isOwn ? "text-white" : "bg-surface-recessed text-foreground"
                      }`}
                      style={isOwn ? { backgroundColor: groupColor } : undefined}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <span className="mt-1 px-1 font-mono text-[11px] text-muted">{formatTime(message.createdAt)}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted">No messages yet. Start the conversation.</p>
          )}
        </div>

        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

        <form
          onSubmit={handleSubmit}
          className="mt-4 flex items-center gap-2 rounded-full border border-border bg-surface-recessed py-[10px] pl-[18px] pr-[10px]"
        >
          <button type="button" aria-label="Attach file" className="shrink-0 text-muted hover:text-foreground">
            <Paperclip size={18} />
          </button>
          <button type="button" aria-label="Add emoji" className="shrink-0 text-muted hover:text-foreground">
            <Smile size={18} />
          </button>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a message"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSending}
            className="shrink-0 rounded-full bg-ink px-5 py-[9px] text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}

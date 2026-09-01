"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import { ArrowLeft, Paperclip, Smile, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendDirectMessage, deleteDirectMessage } from "@/lib/direct-message-actions";

type DirectMessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  replyToId: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  replyTo?: {
    id: string;
    content: string | null;
    isDeleted: boolean;
    senderId: string;
    senderName: string;
  } | null;
};

type UserInfo = {
  id: string;
  name: string;
  email: string;
  profilePicUrl: string | null;
};

type DMThreadProps = {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  otherUser: UserInfo | null;
  initialMessages: DirectMessageRecord[];
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function DMThread({
  conversationId,
  currentUserId,
  currentUserName,
  otherUser,
  initialMessages,
}: DMThreadProps) {
  const [messages, setMessages] = useState<DirectMessageRecord[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<DirectMessageRecord | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const supabase = useMemo(() => createClient(), []);

  function senderNameFor(senderId: string) {
    return senderId === currentUserId ? currentUserName : otherUser?.name || "Unknown";
  }

  // Realtime payloads and the send action's return value are raw DirectMessage
  // rows with no `replyTo` join — rebuild the quote from a message we already
  // hold so replies keep their quoted context without a full page reload.
  function buildReplyTo(
    original:
      | Pick<DirectMessageRecord, "id" | "content" | "isDeleted" | "senderId">
      | undefined
      | null,
  ): DirectMessageRecord["replyTo"] {
    if (!original) return null;
    return {
      id: original.id,
      content: original.content,
      isDeleted: original.isDeleted,
      senderId: original.senderId,
      senderName: senderNameFor(original.senderId),
    };
  }

  function hydrateReplyTo(
    message: DirectMessageRecord,
    pool: DirectMessageRecord[],
  ): DirectMessageRecord {
    if (!message.replyToId || message.replyTo) return message;
    const original = pool.find((item) => item.id === message.replyToId);
    return original ? { ...message, replyTo: buildReplyTo(original) } : message;
  }

  useEffect(() => {
    const channel = supabase.channel(`dm-${conversationId}`);

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "DirectMessage",
        filter: `conversationId=eq.${conversationId}`,
      },
      (payload) => {
        const incomingMessage = payload.new as DirectMessageRecord;
        setMessages((prev) => {
          if (prev.some((item) => item.id === incomingMessage.id)) {
            return prev;
          }
          return [...prev, hydrateReplyTo(incomingMessage, prev)];
        });
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "DirectMessage",
        filter: `conversationId=eq.${conversationId}`,
      },
      (payload) => {
        const updatedMessage = payload.new as DirectMessageRecord;
        setMessages((prev) =>
          prev.map((item) => {
            if (item.id === updatedMessage.id) {
              // Keep any quote we already resolved — the payload has no join.
              return { ...updatedMessage, replyTo: item.replyTo ?? null };
            }
            // A message quoting the one that just changed (e.g. was deleted):
            // refresh its quote so it flips to the deleted state live.
            if (item.replyTo && item.replyTo.id === updatedMessage.id) {
              return {
                ...item,
                replyTo: {
                  ...item.replyTo,
                  content: updatedMessage.content,
                  isDeleted: updatedMessage.isDeleted,
                },
              };
            }
            return item;
          }),
        );
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();

    if (!trimmed || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    const replyContext = replyingTo;
    const optimisticReplyTo = buildReplyTo(replyContext);
    const optimisticMessage: DirectMessageRecord = {
      id: `pending-${Date.now()}`,
      conversationId,
      senderId: currentUserId,
      content: trimmed,
      createdAt: new Date().toISOString(),
      replyToId: replyContext?.id || null,
      isDeleted: false,
      deletedAt: null,
      replyTo: optimisticReplyTo,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setDraft("");

    try {
      const savedRow = (await sendDirectMessage(
        conversationId,
        trimmed,
        replyContext?.id,
      )) as DirectMessageRecord;
      // The action returns a raw row with no `replyTo` join — re-attach the quote.
      const savedMessage: DirectMessageRecord = { ...savedRow, replyTo: optimisticReplyTo };
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((item) => item.id !== optimisticMessage.id);
        if (withoutOptimistic.some((item) => item.id === savedMessage.id)) {
          return withoutOptimistic.map((item) =>
            item.id === savedMessage.id && !item.replyTo ? savedMessage : item,
          );
        }
        return [...withoutOptimistic, savedMessage];
      });
      setReplyingTo(null);
    } catch (err) {
      setMessages((prev) => prev.filter((item) => item.id !== optimisticMessage.id));
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!window.confirm("Delete this message?")) {
      return;
    }

    setDeletingMessageId(messageId);
    setError(null);

    // Snapshot for rollback, then update the sender's own view immediately.
    // The other participant gets the change over the realtime UPDATE channel.
    const previous = messages;
    setMessages((prev) =>
      prev.map((item) =>
        item.id === messageId
          ? { ...item, isDeleted: true, content: null }
          : item.replyTo && item.replyTo.id === messageId
            ? { ...item, replyTo: { ...item.replyTo, isDeleted: true, content: null } }
            : item,
      ),
    );

    try {
      await deleteDirectMessage(messageId, conversationId);
    } catch (err) {
      setMessages(previous);
      setError(err instanceof Error ? err.message : "Failed to delete message.");
    } finally {
      setDeletingMessageId(null);
    }
  }

  function handleReply(message: DirectMessageRecord) {
    setReplyingTo(message);
  }

  function handleScrollToMessage(messageId: string) {
    const element = messageRefs.current[messageId];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-ink");
      setTimeout(() => {
        element.classList.remove("ring-2", "ring-ink");
      }, 2000);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3.5 rounded-xl border border-border bg-surface p-[14px] px-5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold text-foreground">
            {otherUser?.name || "Unknown User"}
          </h1>
          <p className="text-[12.5px] text-muted">{otherUser?.email}</p>
        </div>
        {otherUser?.profilePicUrl ? (
          <Image
            src={otherUser.profilePicUrl}
            alt={otherUser.name}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full border-2 border-surface object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-plum font-heading text-xs font-semibold text-white">
            {(otherUser?.name || "?").charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <section className="flex flex-1 flex-col rounded-xl border border-border bg-surface p-[22px]">
        <div className="flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto pr-2 md:max-h-[480px] md:flex-none">
          {messages.length ? (
            messages.map((message, index) => {
              const isOwn = message.senderId === currentUserId;
              const isDeleted = message.isDeleted;
              const replyTo = message.replyTo;

              return (
                <div
                  key={`${message.id}-${index}`}
                  ref={(el) => {
                    if (el) messageRefs.current[message.id] = el;
                  }}
                  className={`flex max-w-[68%] gap-2.5 group ${
                    isOwn ? "ml-auto flex-row-reverse" : "flex-row"
                  } transition-all rounded`}
                >
                  <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                    {replyTo ? (
                      <button
                        type="button"
                        onClick={() => handleScrollToMessage(replyTo.id)}
                        className="mb-1.5 max-w-xs rounded-lg border-l-2 border-ink bg-surface-recessed px-2.5 py-1.5 text-left transition-colors hover:bg-border"
                      >
                        <p className="text-[11px] font-semibold text-muted">
                          {replyTo.senderName}
                        </p>
                        <p className="line-clamp-2 text-[12px] text-muted">
                          {replyTo.isDeleted
                            ? "Original message was deleted"
                            : replyTo.content}
                        </p>
                      </button>
                    ) : null}
                    {isDeleted ? (
                      <div className="rounded-2xl bg-surface-recessed px-[15px] py-2.5 text-sm leading-[1.45] text-muted italic">
                        <p>This message was deleted</p>
                      </div>
                    ) : (
                      <div className="relative flex items-start gap-2">
                        <div
                          className={`rounded-2xl px-[15px] py-2.5 text-sm leading-[1.45] ${
                            isOwn ? "bg-ink text-white" : "bg-surface-recessed text-foreground"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => handleReply(message)}
                            aria-label="Reply to message"
                            className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-recessed hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ArrowLeft size={16} className="rotate-180" />
                          </button>
                          {isOwn ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(message.id)}
                              disabled={deletingMessageId === message.id}
                              aria-label="Delete message"
                              className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-recessed hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                    <span className="mt-1 px-1 font-mono text-[11px] text-muted">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted">No messages yet. Start the conversation!</p>
          )}
        </div>

        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

        {replyingTo ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-recessed px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-muted">
                Replying to {replyingTo.senderId === currentUserId ? "yourself" : "them"}
              </p>
              <p className="line-clamp-1 text-[12px] text-muted">
                {replyingTo.isDeleted ? "Original message was deleted" : replyingTo.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              className="shrink-0 rounded-lg p-1 text-muted hover:text-foreground hover:bg-border"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

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

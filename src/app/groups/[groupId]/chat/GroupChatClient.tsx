'use client';

import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import { ArrowLeft, Paperclip, Smile, Trash2, X, MessageCircle, Check, CheckCheck, Settings } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { createGroupMessage, deleteMessage, setGroupMessageRead } from "./actions";
import { uploadChatAttachment, type ChatAttachment } from "@/lib/chat-attachments";
import EmojiPicker from "@/components/EmojiPicker";
import MessageAttachment from "@/components/MessageAttachment";

type MessageRecord = {
  id: string;
  groupId: string;
  userId: string;
  content: string | null;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  replyToId: string | null;
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
  } | null;
};

type ReadRecord = { messageId: string; userId: string };

type GroupChatClientProps = {
  groupId: string;
  groupName: string;
  groupColor: string;
  currentUserId: string;
  initialMessages: MessageRecord[];
  initialMembers: MemberRecord[];
  initialReads: ReadRecord[];
  onBack?: () => void;
};

function readKey(messageId: string, userId: string) {
  return `${messageId}:${userId}`;
}

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
  initialReads,
  onBack,
}: GroupChatClientProps) {
  const [messages, setMessages] = useState<MessageRecord[]>(() => sortMessages(initialMessages));
  const [members] = useState<MemberRecord[]>(initialMembers);
  const [readKeys, setReadKeys] = useState<Set<string>>(
    () => new Set(initialReads.map((r) => readKey(r.messageId, r.userId))),
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageRecord | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  // Realtime payloads and the create action's return value are raw Message rows
  // with no `replyTo` join. Rebuild the quote from a message we already hold so
  // replies keep their quoted context without a full page reload.
  function buildReplyTo(
    original: Pick<MessageRecord, "id" | "content" | "isDeleted" | "userId"> | undefined | null,
  ): MessageRecord["replyTo"] {
    if (!original) return null;
    return {
      id: original.id,
      content: original.content,
      isDeleted: original.isDeleted,
      user: { name: memberMap[original.userId]?.user?.name || "Unknown" },
    };
  }

  function hydrateReplyTo(message: MessageRecord, pool: MessageRecord[]): MessageRecord {
    if (!message.replyToId || message.replyTo) return message;
    const original = pool.find((item) => item.id === message.replyToId);
    return original ? { ...message, replyTo: buildReplyTo(original) } : message;
  }

  // Keep the newest message in view, the way a messaging app does.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visibleMessages.length]);

  // Grow the composer with its content (up to ~5 lines), then scroll internally.
  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

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
          return sortMessages([...prev, hydrateReplyTo(incomingMessage, prev)]);
        });
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "Message",
        filter: `groupId=eq.${groupId}`,
      },
      (payload) => {
        const updatedMessage = payload.new as MessageRecord;
        setMessages((prev) =>
          sortMessages(
            prev.map((item) => {
              // The updated row itself — keep any quote we already resolved,
              // since the realtime payload has no `replyTo` join.
              if (item.id === updatedMessage.id) {
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
          ),
        );
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "MessageRead",
        filter: `groupId=eq.${groupId}`,
      },
      (payload) => {
        const row = payload.new as ReadRecord;
        setReadKeys((prev) => {
          const next = new Set(prev);
          next.add(readKey(row.messageId, row.userId));
          return next;
        });
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "MessageRead",
        filter: `groupId=eq.${groupId}`,
      },
      (payload) => {
        const row = payload.old as Partial<ReadRecord>;
        if (!row.messageId || !row.userId) return;
        setReadKeys((prev) => {
          const next = new Set(prev);
          next.delete(readKey(row.messageId as string, row.userId as string));
          return next;
        });
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, supabase]);

  function iHaveRead(messageId: string) {
    return readKeys.has(readKey(messageId, currentUserId));
  }

  // How many *other* members have read a message I sent — powers the "Seen" line.
  function seenByCount(messageId: string) {
    let count = 0;
    for (const member of members) {
      if (member.userId === currentUserId) continue;
      if (readKeys.has(readKey(messageId, member.userId))) count += 1;
    }
    return count;
  }

  async function handleToggleRead(message: MessageRecord) {
    const currentlyRead = iHaveRead(message.id);
    const key = readKey(message.id, currentUserId);
    setReadKeys((prev) => {
      const next = new Set(prev);
      if (currentlyRead) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      await setGroupMessageRead(message.id, !currentlyRead);
    } catch (err) {
      setReadKeys((prev) => {
        const next = new Set(prev);
        if (currentlyRead) next.add(key);
        else next.delete(key);
        return next;
      });
      setError(err instanceof Error ? err.message : "Couldn't update read status.");
    }
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      setDraft((prev) => prev.slice(0, start) + emoji + prev.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const caret = start + emoji.length;
        el.setSelectionRange(caret, caret);
        resizeTextarea();
      });
    } else {
      setDraft((prev) => prev + emoji);
    }
  }

  async function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("scope", `group:${groupId}`);
      const uploaded = await uploadChatAttachment(formData);
      setPendingAttachment(uploaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that file.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    const attachment = pendingAttachment;

    if ((!trimmed && !attachment) || isSending || isUploading) {
      return;
    }

    setIsSending(true);
    setError(null);

    const replyContext = replyingTo;
    const optimisticReplyTo = buildReplyTo(replyContext);
    const optimisticMessage: MessageRecord = {
      id: `pending-${Date.now()}`,
      groupId,
      userId: currentUserId,
      content: trimmed || null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      isDeleted: false,
      deletedAt: null,
      replyToId: replyContext?.id || null,
      attachmentUrl: attachment?.url ?? null,
      attachmentType: attachment?.type ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentSize: attachment?.size ?? null,
      replyTo: optimisticReplyTo,
    };

    setMessages((prev) => sortMessages([...prev, optimisticMessage]));
    setDraft("");
    setPendingAttachment(null);
    requestAnimationFrame(resizeTextarea);

    try {
      const savedRow = (await createGroupMessage(
        groupId,
        trimmed,
        replyContext?.id,
        attachment,
      )) as MessageRecord;
      // The action returns a raw row with no `replyTo` join — re-attach the quote.
      const savedMessage: MessageRecord = { ...savedRow, replyTo: optimisticReplyTo };
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((item) => item.id !== optimisticMessage.id);
        if (withoutOptimistic.some((item) => item.id === savedMessage.id)) {
          // Realtime already delivered this insert while the action was in flight.
          return sortMessages(
            withoutOptimistic.map((item) =>
              item.id === savedMessage.id && !item.replyTo ? savedMessage : item,
            ),
          );
        }
        return sortMessages([...withoutOptimistic, savedMessage]);
      });
      setReplyingTo(null);
    } catch (err) {
      setMessages((prev) => prev.filter((item) => item.id !== optimisticMessage.id));
      setError(err instanceof Error ? err.message : "Unable to send message right now.");
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
    // Other clients get the change over the realtime UPDATE channel.
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
      await deleteMessage(messageId, groupId);
    } catch (err) {
      setMessages(previous);
      setError(err instanceof Error ? err.message : "Failed to delete message.");
    } finally {
      setDeletingMessageId(null);
    }
  }

  function handleReply(message: MessageRecord) {
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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold text-foreground">{groupName}</h1>
          <p className="text-[12.5px] text-muted">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href={`/groups/${groupId}/settings`}
          aria-label="Group settings"
          className="ml-auto shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-recessed hover:text-foreground"
        >
          <Settings size={18} />
        </Link>
        <button
          type="button"
          onClick={() => setShowMembers(!showMembers)}
          className="flex -space-x-2 hover:opacity-70 transition-opacity"
        >
          {members.slice(0, 5).map((member) => (
            <Avatar key={member.id} member={member} />
          ))}
          {members.length > 5 ? (
            <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-surface bg-foreground text-[10.5px] font-medium text-background">
              +{members.length - 5}
            </div>
          ) : null}
        </button>
      </div>

      {showMembers ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 font-semibold text-foreground">Members</h3>
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-recessed p-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar member={member} size={5} />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">
                      {member.user?.name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted truncate">{member.user?.email}</p>
                  </div>
                </div>
                {member.userId !== currentUserId ? (
                  <Link
                    href={`/messages?start=${member.userId}`}
                    className="shrink-0 rounded-lg p-2 text-muted hover:text-foreground hover:bg-border transition-colors"
                    title="Send message"
                  >
                    <MessageCircle size={18} />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <section className="flex flex-1 flex-col rounded-xl border border-border bg-surface p-[22px]">
        <div className="flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto pr-2 md:max-h-[480px] md:flex-none">
          {visibleMessages.length ? (
            visibleMessages.map((message, index) => {
              const isOwn = message.userId === currentUserId;
              const sender = memberMap[message.userId];
              const isDeleted = message.isDeleted;
              const replyTo = message.replyTo;
              const mineIsRead = !isOwn && !isDeleted ? iHaveRead(message.id) : false;
              const seenCount = isOwn && !isDeleted ? seenByCount(message.id) : 0;

              return (
                <div
                  key={`${message.id}-${index}`}
                  ref={(el) => {
                    if (el) messageRefs.current[message.id] = el;
                  }}
                  className={`flex max-w-[68%] gap-2.5 group ${isOwn ? "ml-auto flex-row-reverse" : "flex-row"} transition-all rounded`}
                >
                  {sender && !isDeleted ? <Avatar member={sender} /> : null}
                  <div className={`flex min-w-0 flex-col ${isOwn ? "items-end" : "items-start"}`}>
                    {!isOwn && !isDeleted ? (
                      <span className="mb-[3px] px-1 text-xs font-semibold text-foreground">
                        {sender?.user?.name || "Unknown"}
                      </span>
                    ) : null}
                    {replyTo ? (
                      <button
                        type="button"
                        onClick={() => handleScrollToMessage(replyTo.id)}
                        className="mb-1.5 max-w-xs rounded-lg border-l-2 border-ink bg-surface-recessed px-2.5 py-1.5 text-left transition-colors hover:bg-border"
                      >
                        <p className="text-[11px] font-semibold text-muted">
                          {replyTo.user?.name || "Unknown"}
                        </p>
                        <p className="line-clamp-2 text-[12px] text-muted">
                          {replyTo.isDeleted
                            ? "Original message was deleted"
                            : replyTo.content || "📎 Attachment"}
                        </p>
                      </button>
                    ) : null}
                    {isDeleted ? (
                      <div className="rounded-2xl bg-surface-recessed px-[15px] py-2.5 text-sm leading-[1.45] text-muted italic">
                        <p>This message was deleted</p>
                      </div>
                    ) : (
                      <div className="relative flex min-w-0 items-start gap-2">
                        <div
                          className={`min-w-0 rounded-2xl px-[15px] py-2.5 text-sm leading-[1.45] ${
                            isOwn ? "text-white" : "bg-surface-recessed text-foreground"
                          } ${!isOwn && !mineIsRead ? "ring-1 ring-coral/40" : ""}`}
                          style={isOwn ? { backgroundColor: groupColor } : undefined}
                        >
                          {message.attachmentUrl ? (
                            <MessageAttachment
                              url={message.attachmentUrl}
                              type={message.attachmentType}
                              name={message.attachmentName}
                              size={message.attachmentSize}
                              onDark={isOwn}
                            />
                          ) : null}
                          {message.content ? (
                            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {message.content}
                            </p>
                          ) : null}
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
                          {!isOwn ? (
                            <button
                              type="button"
                              onClick={() => handleToggleRead(message)}
                              aria-label={mineIsRead ? "Mark as unread" : "Mark as read"}
                              title={mineIsRead ? "Mark as unread" : "Mark as read"}
                              className={`shrink-0 rounded-lg p-1.5 hover:bg-surface-recessed ${
                                mineIsRead ? "text-brand" : "text-muted hover:text-foreground"
                              }`}
                            >
                              {mineIsRead ? <CheckCheck size={16} /> : <Check size={16} />}
                            </button>
                          ) : null}
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
                    <span className="mt-1 flex items-center gap-1 px-1 font-mono text-[11px] text-muted">
                      {formatTime(message.createdAt)}
                      {isOwn && !isDeleted && seenCount > 0 ? (
                        <span className="inline-flex items-center gap-0.5 font-sans text-brand">
                          <CheckCheck size={12} />
                          {members.length > 2 ? `Seen by ${seenCount}` : "Seen"}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted">No messages yet. Start the conversation.</p>
          )}
          <div ref={bottomRef} />
        </div>

        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

        {replyingTo ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-recessed px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-muted">
                Replying to {memberMap[replyingTo.userId]?.user?.name || "Unknown"}
              </p>
              <p className="line-clamp-1 text-[12px] text-muted">
                {replyingTo.isDeleted
                  ? "Original message was deleted"
                  : replyingTo.content || "📎 Attachment"}
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

        {isUploading || pendingAttachment ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-recessed px-3 py-2">
            {isUploading ? (
              <p className="flex-1 text-[12px] text-muted">Uploading…</p>
            ) : (
              <>
                {pendingAttachment && pendingAttachment.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pendingAttachment.url}
                    alt={pendingAttachment.name}
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <Paperclip size={16} className="shrink-0 text-muted" />
                )}
                <p className="flex-1 truncate text-[12px] text-foreground">
                  {pendingAttachment?.name}
                </p>
                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  aria-label="Remove attachment"
                  className="shrink-0 rounded-lg p-1 text-muted hover:bg-border hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="relative mt-4 flex items-end gap-2 rounded-3xl border border-border bg-surface-recessed py-[10px] pl-[18px] pr-[10px]"
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFilePicked}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.md,.rtf,.zip,.json"
          />
          <button
            type="button"
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="mb-1 shrink-0 text-muted hover:text-foreground disabled:opacity-50"
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            aria-label="Add emoji"
            onClick={() => setShowEmoji((value) => !value)}
            className={`mb-1 shrink-0 hover:text-foreground ${showEmoji ? "text-brand" : "text-muted"}`}
          >
            <Smile size={18} />
          </button>
          {showEmoji ? (
            <EmojiPicker
              onSelect={(emoji) => insertEmoji(emoji)}
              onClose={() => setShowEmoji(false)}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            placeholder="Write a message"
            className="min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-sm leading-[1.45] text-foreground placeholder:text-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSending || isUploading}
            className="mb-0.5 shrink-0 rounded-full bg-ink px-5 py-[9px] text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}

'use client';

import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ArrowLeft, Loader2, Paperclip, Smile, Trash2, X, MessageCircle, Check, CheckCheck, Settings, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createGroupMessage,
  deleteMessage,
  editGroupMessage,
  fetchGroupMessages,
  searchGroupMessages,
  setGroupMessageRead,
  type MentionCandidate,
  type MessageSearchResult,
} from "./actions";
import { MESSAGE_PAGE_SIZE } from "@/lib/messages-pagination";
import { uploadChatAttachment, type ChatAttachment } from "@/lib/chat-attachments";
import EmojiPicker from "@/components/EmojiPicker";
import MessageAttachment from "@/components/MessageAttachment";
import PresenceStatus, { OnlineDot } from "@/components/PresenceStatus";

const TYPING_TIMEOUT_MS = 3000;
const TYPING_BROADCAST_THROTTLE_MS = 1000;

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

type ReadRecord = { messageId: string; userId: string };

type GroupChatClientProps = {
  groupId: string;
  groupName: string;
  groupColor: string;
  currentUserId: string;
  initialMessages: MessageRecord[];
  initialMembers: MemberRecord[];
  initialReads: ReadRecord[];
  initialHasMore: boolean;
  initialCursor: string | null;
  onBack?: () => void;
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;

function readKey(messageId: string, userId: string) {
  return `${messageId}:${userId}`;
}

// Finds the "@partial name" run ending at the caret, so the mention dropdown
// can open on "@" and keep filtering through multi-word names (which contain
// spaces, so a naive "stop at whitespace" rule would break "@Alice Smith").
function getMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const between = upto.slice(at + 1);
  if (between.includes("\n")) return null;
  const before = upto.slice(0, at);
  if (before.length && !/\s/.test(before[before.length - 1])) return null;
  return { start: at, query: between };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Highlights the substrings of `content` that correspond to this message's
// resolved mentions. Names are re-derived from current member data rather
// than stored per-message, so this always reflects each member's live name.
function renderMessageContent(
  content: string,
  mentionedUserIds: string[],
  memberMap: Record<string, MemberRecord>,
  isOwn: boolean,
) {
  const names = Array.from(
    new Set(
      mentionedUserIds
        .map((id) => memberMap[id]?.user?.name)
        .filter((name): name is string => !!name),
    ),
  ).sort((a, b) => b.length - a.length);

  if (!names.length) return content;

  const pattern = new RegExp(`@(?:${names.map(escapeRegExp).join("|")})`, "g");
  const parts = content.split(pattern);
  const matches = content.match(pattern) ?? [];

  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(<span key={`text-${i}`}>{part}</span>);
    if (matches[i]) {
      nodes.push(
        <span
          key={`mention-${i}`}
          className={`font-semibold ${isOwn ? "text-white underline decoration-white/60" : "text-brand"}`}
        >
          {matches[i]}
        </span>,
      );
    }
  });
  return nodes;
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

function MentionDropdown({
  matches,
  activeIndex,
  onSelect,
}: {
  matches: MemberRecord[];
  activeIndex: number;
  onSelect: (member: MemberRecord) => void;
}) {
  return (
    <div className="absolute bottom-full left-4 z-20 mb-2 max-h-56 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
      {matches.map((member, i) => (
        <button
          key={member.id}
          type="button"
          onClick={() => onSelect(member)}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
            i === activeIndex ? "bg-surface-recessed" : "hover:bg-surface-recessed"
          }`}
        >
          <Avatar member={member} size={5} />
          <span className="truncate text-foreground">{member.user?.name || "Unknown"}</span>
        </button>
      ))}
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
  initialHasMore,
  initialCursor,
  onBack,
}: GroupChatClientProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRecord[]>(() => sortMessages(initialMessages));
  const [members] = useState<MemberRecord[]>(initialMembers);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [readKeys, setReadKeys] = useState<Set<string>>(
    () => new Set(initialReads.map((r) => readKey(r.messageId, r.userId))),
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageRecord | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageRecord | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [showMembers, setShowMembers] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingBroadcastRef = useRef(0);
  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pagination bookkeeping. Refs (not state) so the scroll handler and the
  // "jump to a message" loop always read live values without re-subscribing.
  const cursorRef = useRef<string | null>(initialCursor);
  const hasMoreRef = useRef(initialHasMore);
  const loadOlderInFlightRef = useRef<Promise<void> | null>(null);
  const loadedIdsRef = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  // Set just before an older page is prepended; consumed in a layout effect to
  // pin the viewport to the same message instead of letting it jump.
  const pendingScrollRestoreRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const isRestoringScrollRef = useRef(false);
  const didPrependRef = useRef(false);
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

  const newestVisibleMessageId = visibleMessages[visibleMessages.length - 1]?.id;

  const memberMap = useMemo(
    () => Object.fromEntries(members.map((member) => [member.userId, member])),
    [members],
  );

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.query.toLowerCase();
    return members.filter((member) => (member.user?.name || "").toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members]);

  const typingIndicatorText = useMemo(() => {
    const names = Object.values(typingUsers);
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names.length} people are typing...`;
  }, [typingUsers]);

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

  function broadcastStopTyping() {
    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }
    channelRef.current?.send({
      type: "broadcast",
      event: "stopped_typing",
      payload: { userId: currentUserId },
    });
  }

  // Throttled to ~1/sec while actively typing, with a 3s local timer that
  // fires an explicit "stopped typing" on inactivity — belt-and-suspenders
  // alongside the receiver's own silence timeout.
  function handleTypingActivity() {
    const nowTs = Date.now();
    if (nowTs - lastTypingBroadcastRef.current > TYPING_BROADCAST_THROTTLE_MS) {
      lastTypingBroadcastRef.current = nowTs;
      const myName = memberMap[currentUserId]?.user?.name || "Someone";
      channelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: currentUserId, name: myName },
      });
    }
    if (stopTypingTimerRef.current) clearTimeout(stopTypingTimerRef.current);
    stopTypingTimerRef.current = setTimeout(broadcastStopTyping, TYPING_TIMEOUT_MS);
  }

  function hydrateReplyTo(message: MessageRecord, pool: MessageRecord[]): MessageRecord {
    if (!message.replyToId || message.replyTo) return message;
    const original = pool.find((item) => item.id === message.replyToId);
    return original ? { ...message, replyTo: buildReplyTo(original) } : message;
  }

  // Keep loadedIdsRef in sync so the scroll handler and the "jump to a
  // message" loop can test membership without depending on state timing.
  useEffect(() => {
    loadedIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  // An older page was just prepended: pin the viewport to the message the user
  // was looking at instead of letting the browser hold scrollTop (which would
  // shove them upward by the height of everything inserted above). Runs before
  // paint so there's no visible flash.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const pending = pendingScrollRestoreRef.current;
    if (!el || !pending) return;
    pendingScrollRestoreRef.current = null;
    isRestoringScrollRef.current = true;
    el.scrollTop = el.scrollHeight - pending.prevHeight + pending.prevTop;
    requestAnimationFrame(() => {
      isRestoringScrollRef.current = false;
    });
  }, [messages]);

  // Keep the newest message in view, the way a messaging app does — but not
  // when the change was an older page loading in at the top.
  useEffect(() => {
    if (didPrependRef.current) {
      didPrependRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visibleMessages.length, newestVisibleMessageId]);

  // Ticks so the "Edit" option disappears client-side once the 15-minute
  // window lapses, even if the user never touches the tab. The server is the
  // real enforcement regardless.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  function canEdit(message: MessageRecord) {
    return (
      message.userId === currentUserId &&
      !message.isDeleted &&
      now - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS
    );
  }

  // Grow the composer with its content (up to ~5 lines), then scroll internally.
  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionMatches.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSelectMention(mentionMatches[activeMentionIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function updateMentionState(value: string, caret: number) {
    setMentionQuery(getMentionQuery(value, caret));
    setActiveMentionIndex(0);
  }

  function handleSelectMention(member: MemberRecord) {
    if (!mentionQuery || !member.user) return;
    const name = member.user.name;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, mentionQuery.start);
    const after = draft.slice(caret);
    const insertion = `@${name} `;
    setDraft(before + insertion + after);
    setMentionCandidates((prev) => [...prev, { userId: member.userId, displayText: name }]);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (el) {
        const pos = before.length + insertion.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
      resizeTextarea();
    });
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

    // Typing indicator: transient broadcast, never persisted. Silence — not
    // just an explicit "stopped" event — clears it, so a backgrounded or
    // killed tab doesn't leave a stale "is typing" behind.
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const { userId, name } = payload as { userId: string; name: string };
      if (userId === currentUserId) return;
      setTypingUsers((prev) => ({ ...prev, [userId]: name }));
      clearTimeout(typingTimeoutsRef.current[userId]);
      typingTimeoutsRef.current[userId] = setTimeout(() => {
        setTypingUsers((prev) => {
          if (!(userId in prev)) return prev;
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }, TYPING_TIMEOUT_MS);
    });

    channel.on("broadcast", { event: "stopped_typing" }, ({ payload }) => {
      const { userId } = payload as { userId: string };
      clearTimeout(typingTimeoutsRef.current[userId]);
      setTypingUsers((prev) => {
        if (!(userId in prev)) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    // Group details (name/description/accentColor) can be edited from
    // Settings while this chat is open elsewhere. Re-pull server data rather
    // than patch local state, since the header/sidebar/members list all
    // derive from the same server-rendered props.
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "Group", filter: `id=eq.${groupId}` },
      () => {
        router.refresh();
      },
    );

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
      supabase.removeChannel(channel);
    };
  }, [groupId, supabase, currentUserId, router]);

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

    if (editingMessage) {
      if (!trimmed || isSending) {
        return;
      }
      setIsSending(true);
      setError(null);

      const editTarget = editingMessage;
      const previous = messages;
      setMessages((prev) =>
        prev.map((item) =>
          item.id === editTarget.id
            ? { ...item, content: trimmed, isEdited: true, editedAt: new Date().toISOString() }
            : item,
        ),
      );
      setDraft("");
      setEditingMessage(null);
      requestAnimationFrame(resizeTextarea);

      try {
        await editGroupMessage(editTarget.id, groupId, trimmed);
      } catch (err) {
        setMessages(previous);
        setError(err instanceof Error ? err.message : "Unable to edit message.");
      } finally {
        setIsSending(false);
      }
      return;
    }

    const attachment = pendingAttachment;

    if ((!trimmed && !attachment) || isSending || isUploading) {
      return;
    }

    broadcastStopTyping();
    setIsSending(true);
    setError(null);

    const replyContext = replyingTo;
    const optimisticReplyTo = buildReplyTo(replyContext);
    const mentionSnapshot = mentionCandidates;
    const optimisticMentionedUserIds = Array.from(new Set(mentionSnapshot.map((m) => m.userId)));
    const pendingId = `pending-${Date.now()}`;
    const optimisticMessage: MessageRecord = {
      id: pendingId,
      groupId,
      userId: currentUserId,
      content: trimmed || null,
      createdAt: new Date().toISOString(),
      isEdited: false,
      editedAt: null,
      isDeleted: false,
      deletedAt: null,
      replyToId: replyContext?.id || null,
      mentionedUserIds: optimisticMentionedUserIds,
      attachmentUrl: attachment?.url ?? null,
      attachmentType: attachment?.type ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentSize: attachment?.size ?? null,
      replyTo: optimisticReplyTo,
    };

    setMessages((prev) => sortMessages([...prev, optimisticMessage]));
    setDraft("");
    setPendingAttachment(null);
    setMentionCandidates([]);
    setMentionQuery(null);
    requestAnimationFrame(resizeTextarea);

    try {
      const savedRow = (await createGroupMessage(
        groupId,
        trimmed,
        replyContext?.id,
        attachment,
        mentionSnapshot,
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
    setEditingMessage(null);
    setReplyingTo(message);
  }

  function handleStartEdit(message: MessageRecord) {
    setReplyingTo(null);
    setPendingAttachment(null);
    setMentionQuery(null);
    setMentionCandidates([]);
    setEditingMessage(message);
    setDraft(message.content || "");
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      resizeTextarea();
    });
  }

  function handleCancelEdit() {
    setEditingMessage(null);
    setDraft("");
    requestAnimationFrame(resizeTextarea);
  }

  // Fetch and prepend the page of history immediately before the oldest
  // message currently held. Returns the in-flight promise if one is already
  // running so callers (scroll handler, jump loop) can await the same work.
  function loadOlder(): Promise<void> {
    if (loadOlderInFlightRef.current) return loadOlderInFlightRef.current;
    if (!hasMoreRef.current) return Promise.resolve();

    const run = (async () => {
      setIsLoadingOlder(true);
      try {
        const res = await fetchGroupMessages(groupId, {
          cursor: cursorRef.current,
          limit: MESSAGE_PAGE_SIZE,
        });

        cursorRef.current = res.nextCursor;
        hasMoreRef.current = res.hasMore;
        setHasMore(res.hasMore);

        if (res.reads.length) {
          setReadKeys((prev) => {
            const next = new Set(prev);
            for (const r of res.reads) next.add(readKey(r.messageId, r.userId));
            return next;
          });
        }

        const older = (res.messages as MessageRecord[]).filter(
          (m) => !loadedIdsRef.current.has(m.id),
        );
        if (!older.length) return;

        // Update the loaded-id set synchronously — the jump loop reads it
        // between `await`s, before the syncing effect gets to run.
        for (const m of older) loadedIdsRef.current.add(m.id);

        // Measure right before the prepend so only the inserted rows are
        // unaccounted for when the layout effect restores position.
        const el = scrollContainerRef.current;
        if (el) {
          pendingScrollRestoreRef.current = {
            prevHeight: el.scrollHeight,
            prevTop: el.scrollTop,
          };
        }
        didPrependRef.current = true;
        setMessages((prev) => sortMessages([...older, ...prev]));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load earlier messages.");
      } finally {
        setIsLoadingOlder(false);
      }
    })();

    loadOlderInFlightRef.current = run;
    void run.finally(() => {
      loadOlderInFlightRef.current = null;
    });
    return run;
  }

  // Driven directly from the input's onChange rather than a useEffect keyed
  // on searchQuery — this is a response to a user event, not a sync with an
  // external system, so the debounce timer belongs there.
  function handleSearchQueryChange(value: string) {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    const query = value.trim();
    if (!query) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchGroupMessages(groupId, query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  function handleSearchResultClick(result: MessageSearchResult) {
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    handleScrollToMessage(result.id);
  }

  function handleScroll() {
    if (isRestoringScrollRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollTop <= 80 && hasMoreRef.current) {
      void loadOlder();
    }
  }

  // Reveal a message by id — reply-quote taps and the search "jump to result"
  // flow both call this. If the target isn't in the loaded window, page older
  // history in until it is (or history runs out), then scroll to and flash it.
  async function handleScrollToMessage(messageId: string) {
    let guard = 0;
    while (!loadedIdsRef.current.has(messageId) && hasMoreRef.current && guard < 80) {
      guard += 1;
      await loadOlder();
    }

    const reveal = () => {
      const element = messageRefs.current[messageId];
      if (!element) return false;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-ink");
      setTimeout(() => {
        element.classList.remove("ring-2", "ring-ink");
      }, 2000);
      return true;
    };

    requestAnimationFrame(() => {
      if (reveal()) return;
      if (loadedIdsRef.current.has(messageId)) {
        // Row is loaded but its ref hasn't attached yet — try once more.
        setTimeout(reveal, 60);
      } else {
        setError("Couldn't find that message in this conversation.");
      }
    });
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
        <button
          type="button"
          onClick={() => setShowSearch((v) => !v)}
          aria-label="Search messages"
          className={`ml-auto shrink-0 rounded-lg p-1.5 transition-colors hover:bg-surface-recessed hover:text-foreground ${
            showSearch ? "text-brand" : "text-muted"
          }`}
        >
          <Search size={18} />
        </button>
        <Link
          href={`/groups/${groupId}/settings`}
          aria-label="Group settings"
          className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-recessed hover:text-foreground"
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

      {showSearch ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-recessed px-3 py-2">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(event) => handleSearchQueryChange(event.target.value)}
              placeholder="Search messages in this group"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
            />
            {isSearching ? <Loader2 size={14} className="shrink-0 animate-spin text-muted" /> : null}
          </div>
          {searchQuery.trim() ? (
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {searchResults.length ? (
                searchResults.map((result) => {
                  const sender = memberMap[result.userId];
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => handleSearchResultClick(result)}
                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-recessed"
                    >
                      <p className="text-xs font-semibold text-muted">
                        {sender?.user?.name || "Unknown"} · {formatTime(result.createdAt)}
                      </p>
                      <p className="line-clamp-2 text-sm text-foreground">{result.content}</p>
                    </button>
                  );
                })
              ) : !isSearching ? (
                <p className="px-3 py-2 text-sm text-muted">No messages match &ldquo;{searchQuery.trim()}&rdquo;.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

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
                  <div className="relative shrink-0">
                    <Avatar member={member} size={5} />
                    <OnlineDot userId={member.userId} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">
                      {member.user?.name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted truncate">
                      <PresenceStatus userId={member.userId} lastSeenAt={member.user?.lastSeenAt ?? null} />
                    </p>
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
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="relative flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto pr-2 md:max-h-[480px] md:flex-none"
        >
          {isLoadingOlder ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted shadow-sm">
                <Loader2 size={12} className="animate-spin" />
                Loading earlier messages…
              </span>
            </div>
          ) : null}
          {!hasMore && !isLoadingOlder && visibleMessages.length ? (
            <p className="pt-1 text-center text-[11px] text-muted">Beginning of the conversation</p>
          ) : null}
          {visibleMessages.length ? (
            visibleMessages.map((message, index) => {
              const isOwn = message.userId === currentUserId;
              const sender = memberMap[message.userId];
              const isDeleted = message.isDeleted;
              const replyTo = message.replyTo;
              const mineIsRead = !isOwn && !isDeleted ? iHaveRead(message.id) : false;
              const seenCount = isOwn && !isDeleted ? seenByCount(message.id) : 0;
              const isMentioned = !isDeleted && message.mentionedUserIds?.includes(currentUserId);

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
                          } ${!isOwn && !mineIsRead ? "ring-1 ring-coral/40" : ""} ${
                            isMentioned ? "ring-2 ring-sunflower bg-sunflower/10" : ""
                          }`}
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
                              {renderMessageContent(message.content, message.mentionedUserIds || [], memberMap, isOwn)}
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
                          {isOwn && canEdit(message) ? (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(message)}
                              aria-label="Edit message"
                              className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-recessed hover:text-foreground"
                            >
                              <Pencil size={16} />
                            </button>
                          ) : null}
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
                    <span
                      suppressHydrationWarning
                      className="mt-1 flex items-center gap-1 px-1 font-mono text-[11px] text-muted"
                    >
                      {formatTime(message.createdAt)}
                      {message.isEdited && !isDeleted ? (
                        <span className="font-sans italic">(edited)</span>
                      ) : null}
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

        <p className="mt-1.5 h-4 px-1 text-xs italic text-muted">{typingIndicatorText}</p>

        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

        {editingMessage ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2">
            <Pencil size={14} className="shrink-0 text-brand" />
            <p className="flex-1 min-w-0 truncate text-[12px] font-medium text-brand">
              Editing message
            </p>
            <button
              type="button"
              onClick={handleCancelEdit}
              aria-label="Cancel edit"
              className="shrink-0 rounded-lg p-1 text-muted hover:text-foreground hover:bg-border"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

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
          {mentionQuery !== null && mentionMatches.length ? (
            <MentionDropdown
              matches={mentionMatches}
              activeIndex={activeMentionIndex}
              onSelect={handleSelectMention}
            />
          ) : null}
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
            disabled={isUploading || !!editingMessage}
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
              if (!editingMessage) {
                updateMentionState(event.target.value, event.target.selectionStart ?? event.target.value.length);
                handleTypingActivity();
              }
            }}
            onSelect={(event) => {
              if (editingMessage) return;
              const el = event.currentTarget;
              updateMentionState(el.value, el.selectionStart ?? el.value.length);
            }}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            placeholder={editingMessage ? "Edit your message" : "Write a message"}
            className="min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-sm leading-[1.45] text-foreground placeholder:text-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSending || isUploading}
            className="mb-0.5 shrink-0 rounded-full bg-ink px-5 py-[9px] text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSending ? (editingMessage ? "Saving..." : "Sending...") : editingMessage ? "Save" : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}

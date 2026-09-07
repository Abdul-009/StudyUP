"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push";
import type { ChatAttachment } from "@/lib/chat-attachments";
import {
  clampLimit,
  decodeMessageCursor,
  encodeMessageCursor,
  olderThanCursorFilter,
} from "@/lib/messages-pagination";
import { assertMaxLength, MESSAGE_MAX_LENGTH, sanitizeText } from "@/lib/sanitize-content";
import { assertNotRateLimited } from "@/lib/rate-limit";

export type MentionCandidate = { userId: string; displayText: string };

const MESSAGE_COLUMNS =
  "id, groupId, userId, content, createdAt, editedAt, isEdited, isDeleted, deletedAt, replyToId, mentionedUserIds, attachmentUrl, attachmentType, attachmentName, attachmentSize";

type ReplyToSummary = {
  id: string;
  content: string | null;
  isDeleted: boolean;
  user?: { name: string };
};

// Resolves the quoted-message summary for a batch of freshly fetched messages.
// Mirrors the join the chat page does server-side so a page of older history
// arrives with its reply quotes already attached (a reply can point at a
// message that isn't in the same page, or isn't loaded at all yet).
async function attachReplyTo<T extends { replyToId: string | null }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: T[],
): Promise<(T & { replyTo: ReplyToSummary | null })[]> {
  const replyToIds = Array.from(
    new Set(rows.map((row) => row.replyToId).filter((id): id is string => !!id)),
  );

  const summaries: Record<string, ReplyToSummary> = {};
  if (replyToIds.length) {
    const { data: replyTos } = await supabase
      .from("Message")
      .select("id, content, isDeleted, userId")
      .in("id", replyToIds);

    const authorIds = Array.from(
      new Set((replyTos ?? []).map((row) => row.userId as string)),
    );
    const { data: authors } = authorIds.length
      ? await supabase.from("User").select("id, name").in("id", authorIds)
      : { data: [] as { id: string; name: string }[] };
    const nameById = Object.fromEntries(
      (authors ?? []).map((row) => [row.id, row.name]),
    );

    for (const row of replyTos ?? []) {
      summaries[row.id as string] = {
        id: row.id as string,
        content: row.content as string | null,
        isDeleted: row.isDeleted as boolean,
        user: nameById[row.userId as string]
          ? { name: nameById[row.userId as string] }
          : undefined,
      };
    }
  }

  return rows.map((row) => ({
    ...row,
    replyTo: row.replyToId ? summaries[row.replyToId] ?? null : null,
  }));
}

// One page of group history, walking newest-first from `cursor` (the
// (createdAt, id) of the oldest message the client currently holds, encoded via
// `encodeMessageCursor`). Returns the page most-recent-first, the read receipts
// for exactly those messages, and a `nextCursor` / `hasMore` for the page
// before this one.
export async function fetchGroupMessages(
  groupId: string,
  opts?: { cursor?: string | null; limit?: number },
) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to view messages.");
  }

  const { data: membership } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (!membership) {
    throw new Error("You must be a member of this group to view messages.");
  }

  const limit = clampLimit(opts?.limit);
  const cursor = decodeMessageCursor(opts?.cursor);

  let query = supabase
    .from("Message")
    .select(MESSAGE_COLUMNS)
    .eq("groupId", groupId)
    .order("createdAt", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.or(olderThanCursorFilter(cursor));
  }

  const { data: rows, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const page = (rows ?? []).slice(0, limit);
  const hasMore = (rows ?? []).length > limit;
  const oldest = page[page.length - 1];
  const nextCursor =
    hasMore && oldest
      ? encodeMessageCursor({ createdAt: oldest.createdAt as string, id: oldest.id as string })
      : null;

  const messages = await attachReplyTo(supabase, page);

  const pageIds = page.map((row) => row.id as string);
  const { data: readRows } = pageIds.length
    ? await supabase
        .from("MessageRead")
        .select("messageId, userId")
        .in("messageId", pageIds)
    : { data: [] as { messageId: string; userId: string }[] };

  return { messages, reads: readRows ?? [], hasMore, nextCursor };
}

// Resolves @mentions to user IDs scoped strictly to this group's membership —
// a mention can never resolve to someone outside the group, regardless of
// what the client claims.
//
// The composer tracks {userId, displayText} pairs as the user picks members
// from the dropdown, which is the source of truth (it disambiguates members
// who share a display name, which regex-matching text alone cannot). Each
// candidate is still cross-checked here: the userId must be an actual member,
// and its displayText must literally appear in the content as "@displayText"
// (defends against a client fabricating mentions unrelated to the message).
//
// As a fallback for mentions typed by hand (not via the dropdown), any
// "@FullName" substring that unambiguously matches exactly one member's name
// is also resolved — skipped entirely if two members share that name.
function resolveMentions(
  content: string,
  members: { id: string; name: string }[],
  candidates?: MentionCandidate[] | null,
): string[] {
  const memberIds = new Set(members.map((m) => m.id));
  const resolved = new Set<string>();

  for (const candidate of candidates ?? []) {
    if (
      memberIds.has(candidate.userId) &&
      candidate.displayText &&
      content.includes(`@${candidate.displayText}`)
    ) {
      resolved.add(candidate.userId);
    }
  }

  const nameToId = new Map<string, string>();
  const ambiguousNames = new Set<string>();
  for (const member of members) {
    if (nameToId.has(member.name)) {
      ambiguousNames.add(member.name);
    } else {
      nameToId.set(member.name, member.id);
    }
  }
  for (const [name, id] of nameToId) {
    if (!ambiguousNames.has(name) && content.includes(`@${name}`)) {
      resolved.add(id);
    }
  }

  return Array.from(resolved);
}

export async function createGroupMessage(
  groupId: string,
  content: string,
  replyToId?: string,
  attachment?: ChatAttachment | null,
  mentionCandidates?: MentionCandidate[],
) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to send a message.");
  }

  await assertNotRateLimited(supabase, user.id);

  const trimmedContent = sanitizeText(content);
  if (!trimmedContent && !attachment) {
    throw new Error("Message content is required.");
  }
  if (trimmedContent) {
    assertMaxLength(trimmedContent, MESSAGE_MAX_LENGTH, "Message");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("You must be a member of this group to send messages.");
  }

  const { data: group, error: groupError } = await supabase
    .from("Group")
    .select("id, name")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    throw new Error("Group not found.");
  }

  // Validate replyToId if provided
  if (replyToId) {
    const { data: replyToMessage, error: replyToError } = await supabase
      .from("Message")
      .select("id, groupId")
      .eq("id", replyToId)
      .maybeSingle();

    if (replyToError || !replyToMessage) {
      throw new Error("Message to reply to not found.");
    }

    if (replyToMessage.groupId !== groupId) {
      throw new Error("Cannot reply to a message from a different group.");
    }
  }

  // Resolve @mentions strictly against this group's current membership.
  const { data: memberRows } = await supabase.from("GroupMember").select("userId").eq("groupId", groupId);
  const memberIds = (memberRows ?? []).map((row) => row.userId);
  const { data: memberUsers } = memberIds.length
    ? await supabase.from("User").select("id, name").in("id", memberIds)
    : { data: [] as { id: string; name: string }[] };
  const mentionedUserIds = resolveMentions(trimmedContent, memberUsers ?? [], mentionCandidates);

  const { data: message, error: messageError } = await supabase
    .from("Message")
    .insert({
      groupId,
      userId: user.id,
      content: trimmedContent || null,
      replyToId: replyToId || null,
      mentionedUserIds,
      attachmentUrl: attachment?.url ?? null,
      attachmentType: attachment?.type ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentSize: attachment?.size ?? null,
    })
    .select(
      "id, groupId, userId, content, createdAt, editedAt, isEdited, isDeleted, deletedAt, replyToId, mentionedUserIds, attachmentUrl, attachmentType, attachmentName, attachmentSize",
    )
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || "Failed to send message.");
  }

  const attachmentLabel = attachment
    ? attachment.type.startsWith("image/")
      ? "📷 Photo"
      : `📎 ${attachment.name}`
    : "";
  const base = trimmedContent || attachmentLabel;
  const preview = base.replace(/\s+/g, " ").slice(0, 80);
  const previewText = base.length > 80 ? `${preview}…` : preview;

  const recipientIds = memberIds.filter((memberId) => memberId !== user.id);

  const notifications = recipientIds.map((memberId) => ({
    userId: memberId,
    type: "NEW_MESSAGE",
    groupId,
    refId: message.id,
    content: `New message in ${group.name}: ${previewText}`,
  }));

  if (notifications.length) {
    const { error: notificationError } = await supabase.from("Notification").insert(notifications);
    if (notificationError) {
      throw new Error(notificationError.message);
    }
  }

  if (mentionedUserIds.length) {
    const senderName = (memberUsers ?? []).find((u) => u.id === user.id)?.name || "Someone";
    const mentionPreview = trimmedContent.replace(/\s+/g, " ").slice(0, 80);
    const mentionPreviewText = trimmedContent.length > 80 ? `${mentionPreview}…` : mentionPreview;
    const mentionNotifications = mentionedUserIds
      .filter((memberId) => memberId !== user.id)
      .map((memberId) => ({
        userId: memberId,
        type: "MENTION",
        groupId,
        refId: message.id,
        content: `${senderName} mentioned you in ${group.name}: ${mentionPreviewText}`,
      }));

    if (mentionNotifications.length) {
      const { error: mentionNotificationError } = await supabase.from("Notification").insert(mentionNotifications);
      if (mentionNotificationError) {
        throw new Error(mentionNotificationError.message);
      }
    }
  }

  // Device push (best-effort — never blocks or fails the send).
  await sendPushToUsers(recipientIds, {
    title: group.name,
    body: previewText,
    url: `/groups/${groupId}/chat`,
    tag: `group-${groupId}`,
  });

  revalidatePath(`/groups/${groupId}/chat`);
  return message;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export async function editGroupMessage(messageId: string, groupId: string, content: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to edit a message.");
  }

  const trimmedContent = sanitizeText(content);
  if (!trimmedContent) {
    throw new Error("Message content is required.");
  }
  assertMaxLength(trimmedContent, MESSAGE_MAX_LENGTH, "Message");

  const { data: message, error: messageError } = await supabase
    .from("Message")
    .select("id, userId, groupId, isDeleted, createdAt")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError || !message || message.groupId !== groupId) {
    throw new Error("Message not found.");
  }

  if (message.userId !== user.id) {
    throw new Error("You can only edit your own messages.");
  }

  if (message.isDeleted) {
    throw new Error("You can't edit a deleted message.");
  }

  if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw new Error("Edit window has expired");
  }

  const { data: updatedMessage, error: updateError } = await supabase
    .from("Message")
    .update({
      content: trimmedContent,
      isEdited: true,
      editedAt: new Date().toISOString(),
    })
    .eq("id", messageId)
    .select(
      "id, groupId, userId, content, createdAt, editedAt, isEdited, isDeleted, deletedAt, replyToId, mentionedUserIds, attachmentUrl, attachmentType, attachmentName, attachmentSize",
    )
    .single();

  if (updateError || !updatedMessage) {
    throw new Error(updateError?.message || "Failed to edit message.");
  }

  revalidatePath(`/groups/${groupId}/chat`);
  return updatedMessage;
}

export async function setGroupMessageRead(messageId: string, read: boolean) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in.");
  }

  const { data: message, error: messageError } = await supabase
    .from("Message")
    .select("id, groupId, userId")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError || !message) {
    throw new Error("Message not found.");
  }

  // Marking your own message read is meaningless; block it so "Seen" stays
  // strictly "seen by someone else".
  if (message.userId === user.id) {
    throw new Error("You can't mark your own message as read.");
  }

  const { data: membership } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", message.groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (!membership) {
    throw new Error("You must be a member of this group.");
  }

  if (read) {
    const { error } = await supabase
      .from("MessageRead")
      .upsert(
        { messageId, groupId: message.groupId, userId: user.id },
        { onConflict: "messageId,userId" },
      );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("MessageRead")
      .delete()
      .eq("messageId", messageId)
      .eq("userId", user.id);
    if (error) throw new Error(error.message);
  }

  return { ok: true };
}

export async function deleteMessage(messageId: string, groupId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to delete a message.");
  }

  const { data: message, error: messageError } = await supabase
    .from("Message")
    .select("id, userId, groupId")
    .eq("id", messageId)
    .single();

  if (messageError || !message) {
    throw new Error("Message not found.");
  }

  if (message.userId !== user.id) {
    throw new Error("You can only delete your own messages.");
  }

  const { data: updatedMessage, error: updateError } = await supabase
    .from("Message")
    .update({
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      content: null,
      attachmentUrl: null,
      attachmentType: null,
      attachmentName: null,
      attachmentSize: null,
    })
    .eq("id", messageId)
    .select(
      "id, groupId, userId, content, createdAt, editedAt, isEdited, isDeleted, deletedAt, mentionedUserIds, attachmentUrl, attachmentType, attachmentName, attachmentSize",
    )
    .single();

  if (updateError || !updatedMessage) {
    throw new Error(updateError?.message || "Failed to delete message.");
  }

  revalidatePath(`/groups/${groupId}/chat`);
  return updatedMessage;
}

const SEARCH_RESULT_LIMIT = 30;

export type MessageSearchResult = {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
};

// Scoped strictly to this group, excludes soft-deleted messages (their
// content is already null so an ILIKE wouldn't match them anyway, but the
// isDeleted filter makes that explicit rather than incidental).
export async function searchGroupMessages(groupId: string, query: string): Promise<MessageSearchResult[]> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to search messages.");
  }

  const { data: membership } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (!membership) {
    throw new Error("You must be a member of this group to search its messages.");
  }

  const trimmed = sanitizeText(query);
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("Message")
    .select("id, content, createdAt, userId")
    .eq("groupId", groupId)
    .eq("isDeleted", false)
    .ilike("content", `%${trimmed}%`)
    .order("createdAt", { ascending: false })
    .limit(SEARCH_RESULT_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as MessageSearchResult[];
}

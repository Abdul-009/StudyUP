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

const DM_COLUMNS =
  "id, conversationId, senderId, content, replyToId, isDeleted, deletedAt, createdAt, isEdited, editedAt, attachmentUrl, attachmentType, attachmentName, attachmentSize";

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export async function getDirectMessages(conversationId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  // Verify user has access to this conversation
  const { data: conversation, error: convError } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found.");
  }

  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    throw new Error("You don't have access to this conversation.");
  }

  const { data: messages, error } = await supabase
    .from("DirectMessage")
    .select(DM_COLUMNS)
    .eq("conversationId", conversationId)
    .order("createdAt", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

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
    { id: string; content: string | null; isDeleted: boolean; senderId: string }
  > = {};

  if (replyToIds.size > 0) {
    const { data: replyTos } = await supabase
      .from("DirectMessage")
      .select("id, content, isDeleted, senderId")
      .in("id", Array.from(replyToIds));

    if (replyTos) {
      for (const msg of replyTos) {
        replyToMessages[msg.id] = {
          id: msg.id,
          content: msg.content,
          isDeleted: msg.isDeleted,
          senderId: msg.senderId,
        };
      }
    }
  }

  // Augment messages with replyTo data
  return (messages || []).map((msg) => ({
    ...msg,
    replyTo: msg.replyToId ? replyToMessages[msg.replyToId] : null,
  }));
}

// One page of DM history, walking newest-first from `cursor` (the
// (createdAt, id) of the oldest message the client currently holds, encoded via
// `encodeMessageCursor`). Returns the page most-recent-first, the read receipts
// for exactly those messages, and a `nextCursor` / `hasMore` for the page
// before this one.
export async function fetchDirectMessages(
  conversationId: string,
  opts?: { cursor?: string | null; limit?: number },
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const { data: conversation, error: convError } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found.");
  }

  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    throw new Error("You don't have access to this conversation.");
  }

  const limit = clampLimit(opts?.limit);
  const cursor = decodeMessageCursor(opts?.cursor);

  let query = supabase
    .from("DirectMessage")
    .select(DM_COLUMNS)
    .eq("conversationId", conversationId)
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

  // Reply-quote sender labels: names live on User, not the auth object.
  const otherId =
    conversation.userAId === user.id ? conversation.userBId : conversation.userAId;
  const { data: participantRows } = await supabase
    .from("User")
    .select("id, name")
    .in("id", [user.id, otherId]);
  const nameById = Object.fromEntries(
    (participantRows ?? []).map((row) => [row.id, row.name]),
  );

  const replyToIds = Array.from(
    new Set(page.map((row) => row.replyToId).filter((id): id is string => !!id)),
  );
  const replyToMessages: Record<
    string,
    { id: string; content: string | null; isDeleted: boolean; senderId: string; senderName: string }
  > = {};
  if (replyToIds.length) {
    const { data: replyTos } = await supabase
      .from("DirectMessage")
      .select("id, content, isDeleted, senderId")
      .in("id", replyToIds);
    for (const row of replyTos ?? []) {
      replyToMessages[row.id] = {
        id: row.id,
        content: row.content,
        isDeleted: row.isDeleted,
        senderId: row.senderId,
        senderName: nameById[row.senderId] ?? "Unknown",
      };
    }
  }

  const messages = page.map((msg) => ({
    ...msg,
    replyTo: msg.replyToId ? replyToMessages[msg.replyToId] ?? null : null,
  }));

  const pageIds = page.map((row) => row.id as string);
  const { data: readRows } = pageIds.length
    ? await supabase
        .from("DirectMessageRead")
        .select("messageId, userId")
        .in("messageId", pageIds)
    : { data: [] as { messageId: string; userId: string }[] };

  return { messages, reads: readRows ?? [], hasMore, nextCursor };
}

export async function sendDirectMessage(
  conversationId: string,
  content: string,
  replyToId?: string,
  attachment?: ChatAttachment | null,
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  await assertNotRateLimited(supabase, user.id);

  const trimmedContent = sanitizeText(content);
  if (!trimmedContent && !attachment) {
    throw new Error("Message content is required.");
  }
  if (trimmedContent) {
    assertMaxLength(trimmedContent, MESSAGE_MAX_LENGTH, "Message");
  }

  // Verify user has access to this conversation
  const { data: conversation, error: convError } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found.");
  }

  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    throw new Error("You don't have access to this conversation.");
  }

  // Validate replyToId if provided
  if (replyToId) {
    const { data: replyToMessage, error: replyError } = await supabase
      .from("DirectMessage")
      .select("id, conversationId")
      .eq("id", replyToId)
      .maybeSingle();

    if (replyError || !replyToMessage) {
      throw new Error("Message to reply to not found.");
    }

    if (replyToMessage.conversationId !== conversationId) {
      throw new Error("Cannot reply to a message from a different conversation.");
    }
  }

  const { data: message, error: messageError } = await supabase
    .from("DirectMessage")
    .insert({
      conversationId,
      senderId: user.id,
      content: trimmedContent || null,
      replyToId: replyToId || null,
      attachmentUrl: attachment?.url ?? null,
      attachmentType: attachment?.type ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentSize: attachment?.size ?? null,
    })
    .select(DM_COLUMNS)
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || "Failed to send message.");
  }

  // Update the conversation's createdAt to latest message time (for sorting in message list)
  await supabase
    .from("DirectConversation")
    .update({ createdAt: new Date().toISOString() })
    .eq("id", conversationId);

  // Device push to the other participant (best-effort).
  const recipientId =
    conversation.userAId === user.id ? conversation.userBId : conversation.userAId;
  const { data: senderRow } = await supabase
    .from("User")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  const previewBase =
    trimmedContent ||
    (attachment
      ? attachment.type.startsWith("image/")
        ? "📷 Photo"
        : `📎 ${attachment.name}`
      : "");
  const preview = previewBase.replace(/\s+/g, " ").slice(0, 80);
  await sendPushToUsers([recipientId], {
    title: senderRow?.name || "New message",
    body: previewBase.length > 80 ? `${preview}…` : preview,
    url: `/messages/${conversationId}`,
    tag: `dm-${conversationId}`,
  });

  revalidatePath(`/messages/${conversationId}`);
  return message;
}

export async function editDirectMessage(messageId: string, conversationId: string, content: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const trimmedContent = sanitizeText(content);
  if (!trimmedContent) {
    throw new Error("Message content is required.");
  }
  assertMaxLength(trimmedContent, MESSAGE_MAX_LENGTH, "Message");

  const { data: conversation, error: convError } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found.");
  }

  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    throw new Error("You don't have access to this conversation.");
  }

  const { data: message, error: messageError } = await supabase
    .from("DirectMessage")
    .select("id, senderId, conversationId, isDeleted, createdAt")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError || !message || message.conversationId !== conversationId) {
    throw new Error("Message not found.");
  }

  if (message.senderId !== user.id) {
    throw new Error("You can only edit your own messages.");
  }

  if (message.isDeleted) {
    throw new Error("You can't edit a deleted message.");
  }

  if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw new Error("Edit window has expired");
  }

  const { data: updatedMessage, error: updateError } = await supabase
    .from("DirectMessage")
    .update({
      content: trimmedContent,
      isEdited: true,
      editedAt: new Date().toISOString(),
    })
    .eq("id", messageId)
    .select(DM_COLUMNS)
    .single();

  if (updateError || !updatedMessage) {
    throw new Error(updateError?.message || "Failed to edit message.");
  }

  revalidatePath(`/messages/${conversationId}`);
  return updatedMessage;
}

export async function setDirectMessageRead(
  messageId: string,
  conversationId: string,
  read: boolean,
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const { data: conversation, error: convError } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found.");
  }

  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    throw new Error("You don't have access to this conversation.");
  }

  const { data: message, error: messageError } = await supabase
    .from("DirectMessage")
    .select("id, conversationId, senderId")
    .eq("id", messageId)
    .maybeSingle();

  if (messageError || !message || message.conversationId !== conversationId) {
    throw new Error("Message not found.");
  }

  if (message.senderId === user.id) {
    throw new Error("You can't mark your own message as read.");
  }

  if (read) {
    const { error } = await supabase
      .from("DirectMessageRead")
      .upsert(
        { messageId, conversationId, userId: user.id },
        { onConflict: "messageId,userId" },
      );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("DirectMessageRead")
      .delete()
      .eq("messageId", messageId)
      .eq("userId", user.id);
    if (error) throw new Error(error.message);
  }

  return { ok: true };
}

export async function deleteDirectMessage(messageId: string, conversationId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  // Verify user has access to this conversation
  const { data: conversation, error: convError } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found.");
  }

  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    throw new Error("You don't have access to this conversation.");
  }

  const { data: message, error: messageError } = await supabase
    .from("DirectMessage")
    .select("id, senderId, conversationId")
    .eq("id", messageId)
    .single();

  if (messageError || !message) {
    throw new Error("Message not found.");
  }

  if (message.senderId !== user.id) {
    throw new Error("You can only delete your own messages.");
  }

  const { data: updatedMessage, error: updateError } = await supabase
    .from("DirectMessage")
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
    .select(DM_COLUMNS)
    .single();

  if (updateError || !updatedMessage) {
    throw new Error(updateError?.message || "Failed to delete message.");
  }

  revalidatePath(`/messages/${conversationId}`);
  return updatedMessage;
}

const DM_SEARCH_RESULT_LIMIT = 30;

export type DirectMessageSearchResult = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
};

// Scoped strictly to this conversation, excludes soft-deleted messages.
export async function searchDirectMessages(
  conversationId: string,
  query: string,
): Promise<DirectMessageSearchResult[]> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in to search messages.");
  }

  const { data: conversation, error: convError } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId")
    .eq("id", conversationId)
    .maybeSingle();

  if (convError || !conversation) {
    throw new Error("Conversation not found.");
  }
  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    throw new Error("You don't have access to this conversation.");
  }

  const trimmed = sanitizeText(query);
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("DirectMessage")
    .select("id, content, createdAt, senderId")
    .eq("conversationId", conversationId)
    .eq("isDeleted", false)
    .ilike("content", `%${trimmed}%`)
    .order("createdAt", { ascending: false })
    .limit(DM_SEARCH_RESULT_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DirectMessageSearchResult[];
}

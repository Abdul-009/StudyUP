"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push";
import type { ChatAttachment } from "@/lib/chat-attachments";

const DM_COLUMNS =
  "id, conversationId, senderId, content, replyToId, isDeleted, deletedAt, createdAt, attachmentUrl, attachmentType, attachmentName, attachmentSize";

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

  const trimmedContent = content.trim();
  if (!trimmedContent && !attachment) {
    throw new Error("Message content is required.");
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

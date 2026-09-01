"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, conversationId, senderId, content, replyToId, isDeleted, deletedAt, createdAt")
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
  replyToId?: string
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
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
      content: trimmedContent,
      replyToId: replyToId || null,
    })
    .select("id, conversationId, senderId, content, replyToId, isDeleted, deletedAt, createdAt")
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || "Failed to send message.");
  }

  // Update the conversation's createdAt to latest message time (for sorting in message list)
  await supabase
    .from("DirectConversation")
    .update({ createdAt: new Date().toISOString() })
    .eq("id", conversationId);

  revalidatePath(`/messages/${conversationId}`);
  return message;
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
    })
    .eq("id", messageId)
    .select("id, conversationId, senderId, content, replyToId, isDeleted, deletedAt, createdAt")
    .single();

  if (updateError || !updatedMessage) {
    throw new Error(updateError?.message || "Failed to delete message.");
  }

  revalidatePath(`/messages/${conversationId}`);
  return updatedMessage;
}

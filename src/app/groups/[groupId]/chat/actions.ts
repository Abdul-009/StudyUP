"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createGroupMessage(groupId: string, content: string, replyToId?: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to send a message.");
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error("Message content is required.");
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

  const { data: message, error: messageError } = await supabase
    .from("Message")
    .insert({
      groupId,
      userId: user.id,
      content: trimmedContent,
      replyToId: replyToId || null,
    })
    .select("id, groupId, userId, content, createdAt, editedAt, isDeleted, deletedAt, replyToId")
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || "Failed to send message.");
  }

  const preview = trimmedContent.replace(/\s+/g, " ").slice(0, 80);
  const previewText = trimmedContent.length > 80 ? `${preview}…` : preview;

  const { data: members } = await supabase.from("GroupMember").select("userId").eq("groupId", groupId);
  const notifications = (members ?? [])
    .filter((member) => member.userId !== user.id)
    .map((member) => ({
      userId: member.userId,
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

  revalidatePath(`/groups/${groupId}/chat`);
  return message;
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
    })
    .eq("id", messageId)
    .select("id, groupId, userId, content, createdAt, editedAt, isDeleted, deletedAt")
    .single();

  if (updateError || !updatedMessage) {
    throw new Error(updateError?.message || "Failed to delete message.");
  }

  revalidatePath(`/groups/${groupId}/chat`);
  return updatedMessage;
}

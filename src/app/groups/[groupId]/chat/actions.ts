"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers } from "@/lib/push";
import type { ChatAttachment } from "@/lib/chat-attachments";

export async function createGroupMessage(
  groupId: string,
  content: string,
  replyToId?: string,
  attachment?: ChatAttachment | null,
) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to send a message.");
  }

  const trimmedContent = content.trim();
  if (!trimmedContent && !attachment) {
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
      content: trimmedContent || null,
      replyToId: replyToId || null,
      attachmentUrl: attachment?.url ?? null,
      attachmentType: attachment?.type ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentSize: attachment?.size ?? null,
    })
    .select(
      "id, groupId, userId, content, createdAt, editedAt, isDeleted, deletedAt, replyToId, attachmentUrl, attachmentType, attachmentName, attachmentSize",
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

  const { data: members } = await supabase.from("GroupMember").select("userId").eq("groupId", groupId);
  const recipientIds = (members ?? [])
    .map((member) => member.userId)
    .filter((memberId) => memberId !== user.id);

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
      "id, groupId, userId, content, createdAt, editedAt, isDeleted, deletedAt, attachmentUrl, attachmentType, attachmentName, attachmentSize",
    )
    .single();

  if (updateError || !updatedMessage) {
    throw new Error(updateError?.message || "Failed to delete message.");
  }

  revalidatePath(`/groups/${groupId}/chat`);
  return updatedMessage;
}

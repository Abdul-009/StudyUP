"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createGroupMessage(groupId: string, content: string) {
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

  const { data: message, error: messageError } = await supabase
    .from("Message")
    .insert({
      groupId,
      userId: user.id,
      content: trimmedContent,
    })
    .select("id, groupId, userId, content, createdAt, editedAt")
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || "Failed to send message.");
  }

  const { data: members } = await supabase.from("GroupMember").select("userId").eq("groupId", groupId);
  const notifications = (members ?? [])
    .filter((member) => member.userId !== user.id)
    .map((member) => ({
      userId: member.userId,
      type: "NEW_MESSAGE",
      groupId,
      refId: message.id,
      content: `New message in ${group.name}`,
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

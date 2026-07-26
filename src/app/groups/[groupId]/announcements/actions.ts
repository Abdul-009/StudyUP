"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createAnnouncement(groupId: string, content: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to post announcements.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("GroupMember")
    .select("role")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("You must be a member of this group to post announcements.");
  }

  if (membership.role !== "ADMIN") {
    throw new Error("Only admins can post announcements.");
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error("Announcement content is required.");
  }

  const { data: announcement, error: announcementError } = await supabase
    .from("Announcement")
    .insert({
      groupId,
      postedBy: user.id,
      content: trimmedContent,
    })
    .select("id, groupId, content, createdAt")
    .single();

  if (announcementError || !announcement) {
    throw new Error(announcementError?.message || "Failed to create announcement.");
  }

  const { data: members } = await supabase.from("GroupMember").select("userId").eq("groupId", groupId);
  const notifications = (members ?? []).map((member) => ({
    userId: member.userId,
    type: "ANNOUNCEMENT",
    groupId,
    refId: announcement.id,
    content: "New group announcement",
  }));

  if (notifications.length) {
    const { error: notificationError } = await supabase.from("Notification").insert(notifications);
    if (notificationError) {
      throw new Error(notificationError.message);
    }
  }

  revalidatePath(`/groups/${groupId}/announcements`);
  redirect(`/groups/${groupId}/announcements`);
}

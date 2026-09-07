"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  assertMaxLength,
  ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
  ASSIGNMENT_TITLE_MAX_LENGTH,
  sanitizeText,
} from "@/lib/sanitize-content";

export async function createAssignment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to create assignments.");
  }

  const groupId = String(formData.get("groupId") || "").trim();
  if (!groupId) {
    throw new Error("A group is required.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("You must be a member of this group to create assignments.");
  }

  const title = sanitizeText(String(formData.get("title") || ""));
  if (!title) {
    throw new Error("Assignment title is required.");
  }
  assertMaxLength(title, ASSIGNMENT_TITLE_MAX_LENGTH, "Assignment title");

  const dueDateRaw = String(formData.get("dueDate") || "");
  const dueDateValue = new Date(dueDateRaw);
  if (!dueDateRaw || Number.isNaN(dueDateValue.getTime())) {
    throw new Error("A valid due date is required.");
  }

  const description = sanitizeText(String(formData.get("description") || ""));
  if (description) {
    assertMaxLength(description, ASSIGNMENT_DESCRIPTION_MAX_LENGTH, "Assignment description");
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("Assignment")
    .insert({
      groupId,
      createdBy: user.id,
      title,
      description: description || null,
      dueDate: dueDateValue.toISOString(),
    })
    .select("id, groupId, title, dueDate, createdAt")
    .single();

  if (assignmentError || !assignment) {
    throw new Error(assignmentError?.message || "Failed to create assignment.");
  }

  const { data: members } = await supabase.from("GroupMember").select("userId").eq("groupId", groupId);
  const notifications = (members ?? [])
    .filter((member) => member.userId !== user.id)
    .map((member) => ({
      userId: member.userId,
      type: "NEW_ASSIGNMENT",
      groupId,
      refId: assignment.id,
      content: `New assignment: ${assignment.title}`,
    }));

  if (notifications.length) {
    const { error: notificationError } = await supabase.from("Notification").insert(notifications);
    if (notificationError) {
      throw new Error(notificationError.message);
    }
  }

  revalidatePath(`/groups/${groupId}/assignments`);
  redirect(`/groups/${groupId}/assignments`);
}

export async function toggleAssignmentCompletion(groupId: string, assignmentId: string, completed: boolean) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to update assignment completion.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("You must be a member of this group to update assignment completion.");
  }

  if (completed) {
    const { error: completionError } = await supabase
      .from("AssignmentCompletion")
      .upsert(
        { assignmentId, userId: user.id, groupId },
        { onConflict: "assignmentId,userId" },
      );

    if (completionError) {
      throw new Error(completionError.message);
    }
  } else {
    // completedAt is NOT NULL now — "incomplete" means the row doesn't exist,
    // not a null timestamp.
    const { error: completionError } = await supabase
      .from("AssignmentCompletion")
      .delete()
      .eq("assignmentId", assignmentId)
      .eq("userId", user.id);

    if (completionError) {
      throw new Error(completionError.message);
    }
  }

  // No redirect here - this is called directly from a client component so the
  // checkbox can toggle instantly without a full page reload.
  revalidatePath(`/groups/${groupId}/assignments`);
}

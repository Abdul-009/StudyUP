"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MAX_NAME_LENGTH = 60;

export async function renameGroup(groupId: string, name: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("GroupMember")
    .select("role")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("You must be a member of this group.");
  }

  if (membership.role !== "ADMIN") {
    throw new Error("Only group admins can rename the group.");
  }

  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Group name is required.");
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Group name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }

  const { error: updateError } = await supabase
    .from("Group")
    .update({ name: trimmed })
    .eq("id", groupId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/home");
  revalidatePath(`/groups/${groupId}/settings`);
  revalidatePath(`/groups/${groupId}/chat`);

  return { ok: true, name: trimmed };
}

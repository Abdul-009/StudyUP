"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { leastUsedColor } from "@/lib/groupColors";
import { generateInviteCode } from "@/lib/invite-code";
import {
  assertMaxLength,
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  sanitizeText,
} from "@/lib/sanitize-content";

export async function createGroup(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to create a group.");
  }

  const name = sanitizeText(String(formData.get("name") || ""));
  const description = sanitizeText(String(formData.get("description") || ""));
  const isPrivate = formData.get("isPrivate") === "on";
  const inviteCode = isPrivate ? generateInviteCode() : null;

  if (!name) {
    throw new Error("Group name is required.");
  }
  assertMaxLength(name, GROUP_NAME_MAX_LENGTH, "Group name");
  if (description) {
    assertMaxLength(description, GROUP_DESCRIPTION_MAX_LENGTH, "Group description");
  }

  const { data: myGroups } = await supabase.from("Group").select("accentColor").eq("createdBy", user.id);

  const { data: group, error: groupError } = await supabase
    .from("Group")
    .insert({
      name,
      description: description || null,
      createdBy: user.id,
      isPrivate,
      inviteCode,
      accentColor: leastUsedColor((myGroups ?? []).map((row) => row.accentColor)),
    })
    .select()
    .single();

  if (groupError || !group) {
    throw new Error(groupError?.message || "Failed to create group.");
  }

  const { error: memberError } = await supabase.from("GroupMember").insert({
    groupId: group.id,
    userId: user.id,
    role: "ADMIN",
  });

  if (memberError) {
    throw new Error(memberError.message);
  }

  revalidatePath("/home");
  redirect(`/groups/${group.id}/chat`);
}

// Public groups only: anyone can join. Private groups are invisible to
// non-members (row-level security), so they are joined by invite code through
// the join_group_with_code database function instead.
export async function joinGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to join a group.");
  }

  const { data: group } = await supabase
    .from("Group")
    .select("id, isPrivate")
    .eq("id", groupId)
    .maybeSingle();

  if (!group) {
    throw new Error("Group not found.");
  }
  if (group.isPrivate) {
    throw new Error("This group is private. Join it with an invite code.");
  }

  const { error } = await supabase.from("GroupMember").insert({
    groupId: group.id,
    userId: user.id,
    role: "MEMBER",
  });

  // 23505 = already a member; just take them there.
  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  revalidatePath("/home");
  redirect(`/groups/${group.id}/chat`);
}

export type JoinByCodeState = { error: string | null };

export async function joinGroupByCode(_prev: JoinByCodeState, formData: FormData): Promise<JoinByCodeState> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be signed in to join a group." };
  }

  const code = String(formData.get("inviteCode") || "").trim();
  if (!code) {
    return { error: "Enter an invite code." };
  }

  const { data: groupId, error } = await supabase.rpc("join_group_with_code", { code });

  if (error || !groupId) {
    return { error: "No group matches that invite code. Check it and try again." };
  }

  revalidatePath("/home");
  redirect(`/groups/${groupId}/chat`);
}

export async function joinGroupFromForm(formData: FormData) {
  const groupId = String(formData.get("groupId") || "").trim();

  if (!groupId) {
    throw new Error("A group is required.");
  }

  await joinGroup(groupId);
}

const PUBLIC_GROUPS_PAGE_SIZE = 5;

export async function loadMorePublicGroups(search: string, offset: number) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to search groups.");
  }

  const { data: myMemberships } = await supabase.from("GroupMember").select("groupId").eq("userId", user.id);
  const joinedGroupIds = (myMemberships ?? []).map((row) => row.groupId);

  let query = supabase
    .from("Group")
    .select("id, name, description")
    .eq("isPrivate", false)
    .neq("createdBy", user.id)
    .ilike("name", `%${search}%`)
    .order("createdAt", { ascending: false })
    .range(offset, offset + PUBLIC_GROUPS_PAGE_SIZE - 1);

  if (joinedGroupIds.length) {
    query = query.not("id", "in", `(${joinedGroupIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

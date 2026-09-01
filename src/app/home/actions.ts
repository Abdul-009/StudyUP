"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { leastUsedColor } from "@/lib/groupColors";

function randomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function createGroup(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to create a group.");
  }

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const isPrivate = formData.get("isPrivate") === "on";
  const inviteCode = isPrivate ? randomCode() : null;

  if (!name) {
    throw new Error("Group name is required.");
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
  redirect("/home");
}

export async function joinGroup(groupId: string, inviteCode?: string | null) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to join a group.");
  }

  const { data: group, error: groupError } = await supabase
    .from("Group")
    .select("id, isPrivate, inviteCode")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    throw new Error("Group not found.");
  }

  if (group.isPrivate && inviteCode !== group.inviteCode) {
    throw new Error("Incorrect invite code.");
  }

  const { error } = await supabase.from("GroupMember").insert({
    groupId: group.id,
    userId: user.id,
    role: "MEMBER",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/home");
  redirect("/home");
}

export async function joinGroupFromForm(formData: FormData) {
  const groupId = String(formData.get("groupId") || "").trim();
  const inviteCode = String(formData.get("inviteCode") || "").trim();

  if (!groupId) {
    throw new Error("A group is required.");
  }

  await joinGroup(groupId, inviteCode || null);
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

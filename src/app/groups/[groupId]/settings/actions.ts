"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GROUP_COLOR_PALETTE } from "@/lib/groupColors";
import { generateInviteCode } from "@/lib/invite-code";
import { assertMaxLength, GROUP_DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH, sanitizeText } from "@/lib/sanitize-content";

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("GroupMember")
    .select("id, role")
    .eq("groupId", groupId)
    .eq("userId", userId)
    .maybeSingle();

  if (error || !membership) {
    throw new Error("You must be a member of this group.");
  }
  if (membership.role !== "ADMIN") {
    throw new Error("Only group admins can do this.");
  }
  return membership;
}

export async function updateGroupDetails(
  groupId: string,
  input: { name: string; description: string; accentColor: string },
) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in.");
  }

  await requireAdmin(supabase, groupId, user.id);

  const name = sanitizeText(input.name);
  const description = sanitizeText(input.description);

  if (!name) {
    throw new Error("Group name is required.");
  }
  assertMaxLength(name, GROUP_NAME_MAX_LENGTH, "Group name");
  if (description) {
    assertMaxLength(description, GROUP_DESCRIPTION_MAX_LENGTH, "Group description");
  }

  if (!GROUP_COLOR_PALETTE.includes(input.accentColor as (typeof GROUP_COLOR_PALETTE)[number])) {
    throw new Error("Invalid group color.");
  }

  const { error: updateError } = await supabase
    .from("Group")
    .update({ name, description: description || null, accentColor: input.accentColor })
    .eq("id", groupId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/home");
  revalidatePath(`/groups/${groupId}/settings`);
  revalidatePath(`/groups/${groupId}/chat`);

  return { ok: true, name, description, accentColor: input.accentColor };
}

// Restricted to admins; removes another member's row so they lose access on
// their next fetch of any group page (every group subpage re-checks
// GroupMember on load — see chat/files/announcements/assignments/polls
// page.tsx — so there's no separate "kick" plumbing needed beyond deleting
// the row).
export async function removeMember(groupId: string, targetUserId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in.");
  }

  if (targetUserId === user.id) {
    throw new Error("Use \"Leave group\" to remove yourself.");
  }

  await requireAdmin(supabase, groupId, user.id);

  const { data: target } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", targetUserId)
    .maybeSingle();

  if (!target) {
    throw new Error("That person isn't a member of this group.");
  }

  const { error: deleteError } = await supabase.from("GroupMember").delete().eq("id", target.id);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  revalidatePath(`/groups/${groupId}/settings`);
  revalidatePath(`/groups/${groupId}/chat`);

  return { ok: true };
}

// Leave-group / last-admin rule (explicit, so it's never left ambiguous):
//   - Only member left in the group -> the group is deleted outright (its
//     Messages/Files/etc. cascade via the existing FK constraints). Nobody
//     would be left to see an empty group anyway.
//   - Leaving admin is the group's ONLY admin but other members remain ->
//     the longest-tenured remaining member is auto-promoted to ADMIN in the
//     same operation, so the group is never left without one. No separate
//     "promote a successor first" step for the user to get stuck on.
//   - Otherwise (another admin remains, or this member isn't an admin) ->
//     just remove this membership.
export async function leaveGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in.");
  }

  const { data: members, error: membersError } = await supabase
    .from("GroupMember")
    .select("id, userId, role, joinedAt")
    .eq("groupId", groupId)
    .order("joinedAt", { ascending: true });

  if (membersError) {
    throw new Error(membersError.message);
  }

  const me = (members ?? []).find((m) => m.userId === user.id);
  if (!me) {
    throw new Error("You're not a member of this group.");
  }

  const others = (members ?? []).filter((m) => m.userId !== user.id);

  if (others.length === 0) {
    // Last member out — the group has nobody left to belong to.
    const { error: deleteGroupError } = await supabase.from("Group").delete().eq("id", groupId);
    if (deleteGroupError) {
      throw new Error(deleteGroupError.message);
    }
    revalidatePath("/home");
    redirect("/home");
  }

  const remainingAdmins = others.filter((m) => m.role === "ADMIN");
  if (me.role === "ADMIN" && remainingAdmins.length === 0) {
    const successor = others[0]; // earliest joinedAt among those staying
    const { error: promoteError } = await supabase
      .from("GroupMember")
      .update({ role: "ADMIN" })
      .eq("id", successor.id);
    if (promoteError) {
      throw new Error(promoteError.message);
    }
  }

  const { error: leaveError } = await supabase.from("GroupMember").delete().eq("id", me.id);
  if (leaveError) {
    throw new Error(leaveError.message);
  }

  revalidatePath("/home");
  redirect("/home");
}

// Private groups only. Overwrites the stored code, so any previously shared
// link/code stops working the instant this returns — joinGroup compares
// against the current column value, not a history of past codes.
export async function regenerateInviteCode(groupId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in.");
  }

  await requireAdmin(supabase, groupId, user.id);

  const { data: group, error: groupError } = await supabase
    .from("Group")
    .select("id, isPrivate")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    throw new Error("Group not found.");
  }
  if (!group.isPrivate) {
    throw new Error("Only private groups have an invite code.");
  }

  const inviteCode = generateInviteCode();
  const { error: updateError } = await supabase
    .from("Group")
    .update({ inviteCode })
    .eq("id", groupId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(`/groups/${groupId}/settings`);

  return { ok: true, inviteCode };
}

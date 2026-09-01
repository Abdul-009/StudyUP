"use server";

import { createClient } from "@/lib/supabase/server";

export async function getOrCreateDirectConversation(userIdA: string, userIdB: string) {
  if (!userIdA || !userIdB) {
    throw new Error("Both user IDs are required.");
  }

  if (userIdA === userIdB) {
    throw new Error("Cannot create a conversation with yourself.");
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  // Verify that the current user is one of the two users
  if (user.id !== userIdA && user.id !== userIdB) {
    throw new Error("You can only create conversations involving yourself.");
  }

  // Normalize the pair so userAId < userBId alphabetically
  const [normalizedA, normalizedB] = [userIdA, userIdB].sort();

  // Check if conversation already exists
  const { data: existingConversation } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId, createdAt")
    .eq("userAId", normalizedA)
    .eq("userBId", normalizedB)
    .maybeSingle();

  if (existingConversation) {
    return existingConversation;
  }

  // Verify that the two users share at least one common group
  const { data: userAGroups } = await supabase
    .from("GroupMember")
    .select("groupId")
    .eq("userId", normalizedA);

  const { data: userBGroups } = await supabase
    .from("GroupMember")
    .select("groupId")
    .eq("userId", normalizedB);

  const userAGroupIds = new Set((userAGroups || []).map((row) => row.groupId));
  const userBGroupIds = new Set((userBGroups || []).map((row) => row.groupId));

  const commonGroupIds = [...userAGroupIds].filter((id) => userBGroupIds.has(id));

  if (commonGroupIds.length === 0) {
    throw new Error("You can only message users who share a group with you.");
  }

  // Create new conversation
  const { data: newConversation, error: createError } = await supabase
    .from("DirectConversation")
    .insert({
      userAId: normalizedA,
      userBId: normalizedB,
    })
    .select("id, userAId, userBId, createdAt")
    .single();

  if (createError || !newConversation) {
    throw new Error(createError?.message || "Failed to create conversation.");
  }

  return newConversation;
}

export async function getDirectConversation(conversationId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const { data: conversation, error } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId, createdAt")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !conversation) {
    throw new Error("Conversation not found.");
  }

  // Verify user is part of this conversation
  if (user.id !== conversation.userAId && user.id !== conversation.userBId) {
    throw new Error("You don't have access to this conversation.");
  }

  return conversation;
}

export async function getDirectConversations() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const { data: conversations, error } = await supabase
    .from("DirectConversation")
    .select("id, userAId, userBId, createdAt")
    .or(`userAId.eq.${user.id},userBId.eq.${user.id}`)
    .order("createdAt", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return conversations || [];
}

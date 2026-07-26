"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const POLL_TYPES = ["MEETING_TIME", "STUDY_TOPIC", "CUSTOM"] as const;
const MAX_OPTIONS = 6;

export async function createPoll(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to create a poll.");
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
    throw new Error("You must be a member of this group to create a poll.");
  }

  const question = String(formData.get("question") || "").trim();
  if (!question) {
    throw new Error("Poll question is required.");
  }

  const type = String(formData.get("type") || "");
  if (!(POLL_TYPES as readonly string[]).includes(type)) {
    throw new Error("Invalid poll type.");
  }

  const allowMultiple = formData.get("allowMultiple") === "on";

  const closesAtRaw = String(formData.get("closesAt") || "").trim();
  let closesAt: string | null = null;
  if (closesAtRaw) {
    const closesAtValue = new Date(closesAtRaw);
    if (Number.isNaN(closesAtValue.getTime())) {
      throw new Error("Invalid closing date.");
    }
    closesAt = closesAtValue.toISOString();
  }

  const optionLabels = Array.from({ length: MAX_OPTIONS }, (_, index) =>
    String(formData.get(`option-${index}`) || "").trim(),
  ).filter(Boolean);

  if (optionLabels.length < 2) {
    throw new Error("At least 2 options are required.");
  }

  const { data: poll, error: pollError } = await supabase
    .from("Poll")
    .insert({
      groupId,
      createdBy: user.id,
      question,
      type,
      allowMultiple,
      closesAt,
    })
    .select("id, question")
    .single();

  if (pollError || !poll) {
    throw new Error(pollError?.message || "Failed to create poll.");
  }

  const { error: optionsError } = await supabase
    .from("PollOption")
    .insert(optionLabels.map((label) => ({ pollId: poll.id, label })));

  if (optionsError) {
    throw new Error(optionsError.message);
  }

  const { data: members } = await supabase.from("GroupMember").select("userId").eq("groupId", groupId);
  const notifications = (members ?? [])
    .filter((member) => member.userId !== user.id)
    .map((member) => ({
      userId: member.userId,
      type: "POLL_UPDATE",
      groupId,
      refId: poll.id,
      content: `New poll: ${poll.question}`,
    }));

  if (notifications.length) {
    const { error: notificationError } = await supabase.from("Notification").insert(notifications);
    if (notificationError) {
      throw new Error(notificationError.message);
    }
  }

  revalidatePath(`/groups/${groupId}/polls`);
  redirect(`/groups/${groupId}/polls`);
}

export async function castVote(groupId: string, pollId: string, pollOptionId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to vote.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("You must be a member of this group to vote.");
  }

  const { data: poll, error: pollError } = await supabase
    .from("Poll")
    .select("id, groupId, allowMultiple, closesAt")
    .eq("id", pollId)
    .single();

  if (pollError || !poll || poll.groupId !== groupId) {
    throw new Error("Poll not found.");
  }

  if (poll.closesAt && new Date(poll.closesAt).getTime() <= new Date().getTime()) {
    throw new Error("This poll is closed.");
  }

  const { data: options } = await supabase.from("PollOption").select("id").eq("pollId", pollId);
  const optionIds = (options ?? []).map((option) => option.id);

  const { data: existingVotes, error: existingVotesError } = await supabase
    .from("PollVote")
    .select("id, pollOptionId")
    .eq("userId", user.id)
    .in("pollOptionId", optionIds.length ? optionIds : ["00000000-0000-0000-0000-000000000000"]);

  if (existingVotesError) {
    throw new Error(existingVotesError.message);
  }

  const votedForChosenOption = (existingVotes ?? []).find((vote) => vote.pollOptionId === pollOptionId);

  if (poll.allowMultiple) {
    if (votedForChosenOption) {
      const { error } = await supabase.from("PollVote").delete().eq("id", votedForChosenOption.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("PollVote").insert({ pollOptionId, userId: user.id });
      if (error) throw new Error(error.message);
    }
  } else if (votedForChosenOption) {
    const { error } = await supabase.from("PollVote").delete().eq("id", votedForChosenOption.id);
    if (error) throw new Error(error.message);
  } else {
    const existingIds = (existingVotes ?? []).map((vote) => vote.id);
    if (existingIds.length) {
      const { error: deleteError } = await supabase.from("PollVote").delete().in("id", existingIds);
      if (deleteError) throw new Error(deleteError.message);
    }
    const { error: insertError } = await supabase.from("PollVote").insert({ pollOptionId, userId: user.id });
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath(`/groups/${groupId}/polls`);
}

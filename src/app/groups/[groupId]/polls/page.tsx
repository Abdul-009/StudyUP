import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreatePollModal from "./CreatePollModal";
import PollsListClient from "./PollsListClient";

type PollType = "MEETING_TIME" | "STUDY_TOPIC" | "CUSTOM";

export default async function GroupPollsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/home");
  }

  const { data: group } = await supabase.from("Group").select("id, name, accentColor").eq("id", groupId).single();
  if (!group) {
    redirect("/home");
  }

  const { data: polls } = await supabase
    .from("Poll")
    .select("id, groupId, createdBy, question, type, allowMultiple, closesAt, createdAt")
    .eq("groupId", groupId)
    .order("createdAt", { ascending: false });

  const pollIds = (polls ?? []).map((poll) => poll.id);

  let optionRows: { id: string; pollId: string; label: string }[] = [];
  if (pollIds.length) {
    const { data } = await supabase.from("PollOption").select("id, pollId, label").in("pollId", pollIds);
    optionRows = data ?? [];
  }

  const optionIds = optionRows.map((option) => option.id);
  let voteRows: { pollOptionId: string; userId: string }[] = [];
  if (optionIds.length) {
    const { data } = await supabase.from("PollVote").select("pollOptionId, userId").in("pollOptionId", optionIds);
    voteRows = data ?? [];
  }

  const pollList = (polls ?? []).map((poll) => ({
    id: poll.id,
    question: poll.question,
    type: poll.type as PollType,
    allowMultiple: poll.allowMultiple,
    closesAt: poll.closesAt,
    createdAt: poll.createdAt,
    options: optionRows
      .filter((option) => option.pollId === poll.id)
      .map((option) => ({
        id: option.id,
        label: option.label,
        voteCount: voteRows.filter((vote) => vote.pollOptionId === option.id).length,
        votedByCurrentUser: voteRows.some((vote) => vote.pollOptionId === option.id && vote.userId === user.id),
      })),
  }));

  return (
    <main className="px-11 py-9">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold tracking-[-0.02em] text-foreground">Polls</h1>
          <p className="mt-1 text-sm text-muted">{group.name}</p>
        </div>
        <CreatePollModal groupId={groupId} />
      </div>

      <PollsListClient
        groupId={groupId}
        groupName={group.name}
        groupColor={group.accentColor}
        currentUserId={user.id}
        initialPolls={pollList}
      />
    </main>
  );
}

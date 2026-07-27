import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateAssignmentModal from "./CreateAssignmentModal";
import AssignmentsListClient from "./AssignmentsListClient";

export default async function GroupAssignmentsPage({ params }: { params: Promise<{ groupId: string }> }) {
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

  const { count: totalMembers } = await supabase
    .from("GroupMember")
    .select("id", { count: "exact", head: true })
    .eq("groupId", groupId);

  const { data: assignments } = await supabase
    .from("Assignment")
    .select("id, title, dueDate")
    .eq("groupId", groupId)
    .order("dueDate", { ascending: true });

  const assignmentIds = (assignments ?? []).map((assignment) => assignment.id);
  let completions: { assignmentId: string; userId: string; completedAt: string | null }[] = [];

  if (assignmentIds.length) {
    const { data } = await supabase
      .from("AssignmentCompletion")
      .select("assignmentId, userId, completedAt")
      .in("assignmentId", assignmentIds);
    completions = data ?? [];
  }

  const completedCounts: Record<string, number> = {};
  const completedByCurrentUser: Record<string, boolean> = {};

  for (const completion of completions) {
    if (!completion.completedAt) continue;
    completedCounts[completion.assignmentId] = (completedCounts[completion.assignmentId] ?? 0) + 1;
    if (completion.userId === user.id) {
      completedByCurrentUser[completion.assignmentId] = true;
    }
  }

  const assignmentList = (assignments ?? []).map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    dueDate: assignment.dueDate,
    completedCount: completedCounts[assignment.id] ?? 0,
    isCompletedByCurrentUser: Boolean(completedByCurrentUser[assignment.id]),
  }));

  return (
    <main className="px-4 py-6 md:px-11 md:py-9">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">Assignments</h1>
          <p className="mt-1 text-sm text-muted">{group.name}</p>
        </div>
        <CreateAssignmentModal groupId={groupId} />
      </div>

      <AssignmentsListClient
        groupId={groupId}
        groupName={group.name}
        groupColor={group.accentColor}
        totalMembers={totalMembers ?? 0}
        initialAssignments={assignmentList}
      />
    </main>
  );
}

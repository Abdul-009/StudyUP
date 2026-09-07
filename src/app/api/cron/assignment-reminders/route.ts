import { createClient as createServiceClient } from "@supabase/supabase-js";

// Runs dynamically on every invocation — this is a scheduled job, not a page,
// so there's nothing to statically cache.
export const dynamic = "force-dynamic";

// How far ahead of the due date a reminder should fire. Configurable per the
// task's ask — kept as a single constant rather than plumbed through env so
// there's one obvious place to change it.
const REMINDER_WINDOW_HOURS = 24;

// Service-role client: this job has no user session (it's invoked by Vercel
// Cron, not a browser), and needs to read across every group's assignments,
// members, and completions. Same pattern as src/lib/push.ts's adminClient().
function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
// set on the project — this rejects anyone else who finds the URL. If
// CRON_SECRET isn't configured yet, the check is skipped (so this still works
// during setup) rather than locking the route out entirely.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = adminClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

  // Assignments due within the window, not yet overdue (overdue ones get no
  // "coming up" reminder — that ship has sailed, the UI already marks them
  // overdue).
  const { data: assignments, error: assignmentsError } = await supabase
    .from("Assignment")
    .select("id, groupId, title, dueDate")
    .gte("dueDate", now.toISOString())
    .lte("dueDate", windowEnd.toISOString());

  if (assignmentsError) {
    return Response.json({ error: assignmentsError.message }, { status: 500 });
  }
  if (!assignments?.length) {
    return Response.json({ remindersCreated: 0 });
  }

  const assignmentIds = assignments.map((a) => a.id);
  const groupIds = Array.from(new Set(assignments.map((a) => a.groupId)));

  const [{ data: members }, { data: completions }] = await Promise.all([
    supabase.from("GroupMember").select("groupId, userId").in("groupId", groupIds),
    supabase.from("AssignmentCompletion").select("assignmentId, userId").in("assignmentId", assignmentIds),
  ]);

  const completedKeys = new Set((completions ?? []).map((c) => `${c.assignmentId}:${c.userId}`));
  const membersByGroup = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = membersByGroup.get(m.groupId) ?? [];
    list.push(m.userId);
    membersByGroup.set(m.groupId, list);
  }

  const candidates: { userId: string; type: "ASSIGNMENT_REMINDER"; groupId: string; refId: string; content: string }[] = [];
  for (const assignment of assignments) {
    for (const userId of membersByGroup.get(assignment.groupId) ?? []) {
      if (completedKeys.has(`${assignment.id}:${userId}`)) continue; // already done, no nag needed
      candidates.push({
        userId,
        type: "ASSIGNMENT_REMINDER",
        groupId: assignment.groupId,
        refId: assignment.id,
        content: `"${assignment.title}" is due ${assignment.dueDate < now.toISOString() ? "now" : "soon"}`,
      });
    }
  }

  if (!candidates.length) {
    return Response.json({ remindersCreated: 0 });
  }

  // The partial unique index on (userId, refId) WHERE type = 'ASSIGNMENT_REMINDER'
  // (see add_assignment_completion_tracking) is the real dedup guarantee. It
  // can't be targeted via PostgREST's upsert `onConflict` though — Postgres's
  // ON CONFLICT (columns) only matches a *full* unique constraint on those
  // columns, not a partial one, unless the ON CONFLICT clause also repeats
  // the partial index's WHERE predicate, which PostgREST's upsert has no way
  // to express. So: plain inserts, one at a time (a multi-row insert aborts
  // entirely if any single row conflicts), treating a 23505 (unique
  // violation) as "already reminded" rather than a failure — that's the
  // expected outcome on a re-run or an overlapping concurrent run.
  let remindersCreated = 0;
  for (const candidate of candidates) {
    const { error: insertError } = await supabase.from("Notification").insert(candidate);
    if (insertError) {
      if (insertError.code === "23505") continue;
      return Response.json({ error: insertError.message }, { status: 500 });
    }
    remindersCreated++;
  }

  return Response.json({ remindersCreated, candidates: candidates.length });
}

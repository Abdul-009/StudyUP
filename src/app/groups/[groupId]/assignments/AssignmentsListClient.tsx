"use client";

import { useState } from "react";
import { toggleAssignmentCompletion } from "./actions";

type AssignmentStatus = "upcoming" | "overdue" | "completed";

type AssignmentRecord = {
  id: string;
  title: string;
  dueDate: string;
  completedCount: number;
  isCompletedByCurrentUser: boolean;
};

type AssignmentsListClientProps = {
  groupId: string;
  groupName: string;
  groupColor: string;
  totalMembers: number;
  initialAssignments: AssignmentRecord[];
};

const TABS: AssignmentStatus[] = ["upcoming", "overdue", "completed"];
const DAY_MS = 24 * 60 * 60 * 1000;

function statusOf(assignment: AssignmentRecord, now: number): AssignmentStatus {
  if (assignment.isCompletedByCurrentUser) return "completed";
  return new Date(assignment.dueDate).getTime() < now ? "overdue" : "upcoming";
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function AssignmentsListClient({
  groupId,
  groupName,
  groupColor,
  totalMembers,
  initialAssignments,
}: AssignmentsListClientProps) {
  const [assignments, setAssignments] = useState<AssignmentRecord[]>(initialAssignments);
  const [activeTab, setActiveTab] = useState<AssignmentStatus>("upcoming");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(assignment: AssignmentRecord) {
    const nextCompleted = !assignment.isCompletedByCurrentUser;
    setError(null);
    setPendingId(assignment.id);

    setAssignments((prev) =>
      prev.map((item) =>
        item.id === assignment.id
          ? {
              ...item,
              isCompletedByCurrentUser: nextCompleted,
              completedCount: item.completedCount + (nextCompleted ? 1 : -1),
            }
          : item,
      ),
    );

    try {
      await toggleAssignmentCompletion(groupId, assignment.id, nextCompleted);
    } catch (err) {
      setAssignments((prev) =>
        prev.map((item) =>
          item.id === assignment.id
            ? {
                ...item,
                isCompletedByCurrentUser: !nextCompleted,
                completedCount: item.completedCount + (nextCompleted ? -1 : 1),
              }
            : item,
        ),
      );
      setError(err instanceof Error ? err.message : "Unable to update assignment right now.");
    } finally {
      setPendingId(null);
    }
  }

  const now = new Date().getTime();
  const visibleAssignments = assignments.filter((assignment) => statusOf(assignment, now) === activeTab);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-[20px] border px-3.5 py-[7px] text-[13px] font-medium capitalize ${
              activeTab === tab ? "border-ink bg-ink text-white" : "border-border text-muted"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex flex-col gap-3">
        {visibleAssignments.length ? (
          visibleAssignments.map((assignment) => {
            const dueDate = new Date(assignment.dueDate);
            const isDueSoonOrOverdue = dueDate.getTime() - now <= DAY_MS;
            const isCompleted = assignment.isCompletedByCurrentUser;

            return (
              <div
                key={assignment.id}
                className="flex items-center gap-4 rounded-xl border border-border border-l-4 bg-surface px-5 py-4"
                style={{ borderLeftColor: groupColor }}
              >
                <button
                  type="button"
                  onClick={() => handleToggle(assignment)}
                  disabled={pendingId === assignment.id}
                  aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isCompleted ? "border-sage bg-sage text-white" : "border-border text-transparent hover:border-foreground"
                  }`}
                >
                  <CheckIcon />
                </button>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold text-foreground">{assignment.title}</h3>
                  <p className="truncate text-xs text-muted">{groupName}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className={`font-mono text-[12.5px] font-semibold ${isDueSoonOrOverdue ? "text-coral" : "text-foreground"}`}>
                    {dueDate.toLocaleDateString()}
                  </p>
                  <p className="mt-[3px] text-[11.5px] text-muted">
                    {assignment.completedCount}/{totalMembers} done
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted">No assignments in this view.</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { tintColor } from "@/lib/groupColors";
import { castVote } from "./actions";

type PollOptionRecord = {
  id: string;
  label: string;
  voteCount: number;
  votedByCurrentUser: boolean;
};

type PollRecord = {
  id: string;
  question: string;
  type: "MEETING_TIME" | "STUDY_TOPIC" | "CUSTOM";
  allowMultiple: boolean;
  closesAt: string | null;
  createdAt: string;
  options: PollOptionRecord[];
};

type PollsListClientProps = {
  groupId: string;
  groupName: string;
  groupColor: string;
  currentUserId: string;
  initialPolls: PollRecord[];
};

function formatClosesIn(closesAt: string | null, now: number) {
  if (!closesAt) return null;

  const diffMs = new Date(closesAt).getTime() - now;
  if (diffMs <= 0) return "Closed";

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `Closes in ${days}d ${hours}h`;
}

export default function PollsListClient({
  groupId,
  groupName,
  groupColor,
  currentUserId,
  initialPolls,
}: PollsListClientProps) {
  const [polls, setPolls] = useState<PollRecord[]>(initialPolls);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  const optionIds = useMemo(
    () => initialPolls.flatMap((poll) => poll.options.map((option) => option.id)),
    [initialPolls],
  );

  useEffect(() => {
    if (!optionIds.length) return;

    async function refreshVotes() {
      const { data: voteRows } = await supabase
        .from("PollVote")
        .select("pollOptionId, userId")
        .in("pollOptionId", optionIds);

      setPolls((prev) =>
        prev.map((poll) => ({
          ...poll,
          options: poll.options.map((option) => ({
            ...option,
            voteCount: (voteRows ?? []).filter((vote) => vote.pollOptionId === option.id).length,
            votedByCurrentUser: (voteRows ?? []).some(
              (vote) => vote.pollOptionId === option.id && vote.userId === currentUserId,
            ),
          })),
        })),
      );
    }

    const channel = supabase.channel(`group-polls-${groupId}`);

    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "PollVote" }, () => {
      refreshVotes();
    });

    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "PollVote" }, () => {
      refreshVotes();
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, supabase, optionIds, currentUserId]);

  async function handleVote(pollId: string, pollOptionId: string) {
    setError(null);
    setPendingOptionId(pollOptionId);

    try {
      await castVote(groupId, pollId, pollOptionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cast vote right now.");
    } finally {
      setPendingOptionId(null);
    }
  }

  const now = new Date().getTime();
  const fillColor = tintColor(groupColor);

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {polls.length ? (
        polls.map((poll) => {
          const totalVotes = poll.options.reduce((sum, option) => sum + option.voteCount, 0);
          const isClosed = Boolean(poll.closesAt) && new Date(poll.closesAt as string).getTime() <= now;
          const closesLabel = formatClosesIn(poll.closesAt, now);

          return (
            <div
              key={poll.id}
              className="rounded-xl border border-border border-l-4 bg-surface px-4 py-4 sm:px-[22px] sm:py-5"
              style={{ borderLeftColor: groupColor }}
            >
              <p className="mb-1 text-xs text-muted">{groupName}</p>
              <div className="mb-3.5 flex flex-wrap items-center gap-2">
                <h3 className="text-[16px] font-semibold text-foreground">{poll.question}</h3>
                {poll.allowMultiple ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                    Multiple choice
                  </span>
                ) : null}
              </div>

              <div className="space-y-2.5">
                {poll.options.map((option) => {
                  const percentage = totalVotes ? Math.round((option.voteCount / totalVotes) * 100) : 0;

                  const optionContent = (
                    <>
                      <div className="mb-[5px] flex items-center justify-between gap-3 text-[13.5px]">
                        <span
                          className={`flex items-center gap-1 ${
                            option.votedByCurrentUser ? "font-medium text-foreground" : "text-foreground"
                          }`}
                        >
                          {option.votedByCurrentUser ? <Check size={14} strokeWidth={3} /> : null}
                          {option.label}
                        </span>
                        <span className="font-mono text-[12.5px] font-semibold text-foreground">{percentage}%</span>
                      </div>
                      <div className="h-[10px] overflow-hidden rounded-[8px] bg-surface-recessed">
                        <div
                          className="h-full rounded-[8px] transition-all"
                          style={{ width: `${percentage}%`, backgroundColor: fillColor }}
                        />
                      </div>
                    </>
                  );

                  if (isClosed) {
                    return (
                      <div key={option.id} className="opacity-80">
                        {optionContent}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleVote(poll.id, option.id)}
                      disabled={pendingOptionId === option.id}
                      className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {optionContent}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {totalVotes} vote{totalVotes === 1 ? "" : "s"}
                </span>
                {closesLabel ? <span className="font-mono">{closesLabel}</span> : null}
              </div>
            </div>
          );
        })
      ) : (
        <p className="text-sm text-muted">No polls yet.</p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { regenerateInviteCode } from "./actions";

type Props = {
  groupId: string;
  initialInviteCode: string | null;
  canEdit: boolean;
};

export default function InviteCodeSection({ groupId, initialInviteCode, canEdit }: Props) {
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    if (
      !window.confirm(
        "Generate a new invite code? The current code will stop working immediately — anyone with the old link or code won't be able to join.",
      )
    ) {
      return;
    }
    setRegenerating(true);
    setError(null);
    try {
      const result = await regenerateInviteCode(groupId);
      setInviteCode(result.inviteCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't regenerate the invite code.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <code className="rounded-lg bg-surface-recessed px-3 py-2 font-mono text-[15px] font-semibold tracking-[0.08em] text-foreground">
          {inviteCode || "—"}
        </code>
        {canEdit ? (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-semibold text-foreground hover:bg-surface-recessed disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={regenerating ? "animate-spin" : undefined} />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Share this code with people you want to invite. Regenerating it immediately invalidates
        the current code — anyone who has it (or a link with it) will no longer be able to join.
      </p>
      {error ? <p className="text-sm text-coral">{error}</p> : null}
    </div>
  );
}

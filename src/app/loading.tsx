import { Loader2 } from "lucide-react";

// Shown instantly while a page's server data loads, so navigation gives
// immediate feedback instead of the old page sitting frozen.
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24" role="status" aria-label="Loading">
      <Loader2 size={28} className="animate-spin text-muted" />
    </div>
  );
}

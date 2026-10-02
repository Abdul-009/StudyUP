import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { assignGroupColors } from "@/lib/groupColors";

// Colours for every group the user belongs to, computed together so they stay
// distinct and match what the list pages show. Cached per request.
export const getGroupColors = cache(async (userId: string): Promise<Record<string, string>> => {
  const supabase = await createClient();
  const { data: memberships } = await supabase.from("GroupMember").select("groupId").eq("userId", userId);
  const ids = (memberships ?? []).map((row) => row.groupId);
  if (!ids.length) return {};
  const { data: groups } = await supabase.from("Group").select("id, accentColor").in("id", ids);
  return assignGroupColors(groups ?? []);
});

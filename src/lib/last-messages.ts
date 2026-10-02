import type { SupabaseClient } from "@supabase/supabase-js";

export type LastMessage = { content: string; createdAt: string };
export type LastDirectMessage = LastMessage & { senderId: string };

type PreviewSource = {
  content: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
};

// Attachment-only messages have null content; show a label instead of "null".
function previewOf(row: PreviewSource): string {
  if (row.content) return row.content;
  if (row.attachmentType?.startsWith("image/")) return "📷 Photo";
  if (row.attachmentType?.startsWith("video/")) return "🎥 Video";
  if (row.attachmentName) return `📎 ${row.attachmentName}`;
  return "Message";
}

// One indexed LIMIT 1 lookup per group, run in parallel. The previous approach
// pulled every message ever sent in every group just to keep the newest of each.
export async function fetchLastGroupMessages(
  supabase: SupabaseClient,
  groupIds: string[],
): Promise<Record<string, LastMessage>> {
  const rows = await Promise.all(
    groupIds.map(async (groupId) => {
      const { data } = await supabase
        .from("Message")
        .select("content, createdAt, attachmentType, attachmentName")
        .eq("groupId", groupId)
        .eq("isDeleted", false)
        .order("createdAt", { ascending: false })
        .limit(1)
        .maybeSingle();
      return [groupId, data] as const;
    }),
  );

  const result: Record<string, LastMessage> = {};
  for (const [groupId, row] of rows) {
    if (row) result[groupId] = { content: previewOf(row), createdAt: row.createdAt };
  }
  return result;
}

export async function fetchLastDirectMessages(
  supabase: SupabaseClient,
  conversationIds: string[],
): Promise<Record<string, LastDirectMessage>> {
  const rows = await Promise.all(
    conversationIds.map(async (conversationId) => {
      const { data } = await supabase
        .from("DirectMessage")
        .select("content, createdAt, senderId, attachmentType, attachmentName")
        .eq("conversationId", conversationId)
        .eq("isDeleted", false)
        .order("createdAt", { ascending: false })
        .limit(1)
        .maybeSingle();
      return [conversationId, data] as const;
    }),
  );

  const result: Record<string, LastDirectMessage> = {};
  for (const [conversationId, row] of rows) {
    if (row) {
      result[conversationId] = {
        content: previewOf(row),
        createdAt: row.createdAt,
        senderId: row.senderId,
      };
    }
  }
  return result;
}

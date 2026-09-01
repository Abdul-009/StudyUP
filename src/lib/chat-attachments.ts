"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "chat-attachments";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB (serverActions bodySizeLimit is 12mb)

// Permissive allow-list — images and common document/archive types, matching the
// kinds of things you'd share in WhatsApp. Executables and scripts are excluded.
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "svg",
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "txt", "csv", "md", "rtf",
  "zip", "json",
]);

export type ChatAttachment = {
  url: string;
  type: string;
  name: string;
  size: number;
};

function sanitizeFileName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const baseName = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 60);
  return `${baseName || "file"}-${Date.now()}-${Math.random().toString(36).slice(2)}${
    extension ? `.${extension}` : ""
  }`;
}

/**
 * Upload one chat attachment and return its public URL + metadata. The caller
 * then passes that metadata to createGroupMessage / sendDirectMessage.
 *
 * FormData fields:
 *   file  - the File
 *   scope - "group:<groupId>" | "dm:<conversationId>"
 */
export async function uploadChatAttachment(formData: FormData): Promise<ChatAttachment> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to upload.");
  }

  const file = formData.get("file");
  const scope = String(formData.get("scope") || "").trim();

  if (!(file instanceof File)) {
    throw new Error("Please choose a file.");
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error("Attachments must be 10MB or less.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("That file type isn't supported.");
  }

  let storageFolder: string;

  if (scope.startsWith("group:")) {
    const groupId = scope.slice("group:".length);
    const { data: membership } = await supabase
      .from("GroupMember")
      .select("id")
      .eq("groupId", groupId)
      .eq("userId", user.id)
      .maybeSingle();
    if (!membership) {
      throw new Error("You must be a member of this group to upload.");
    }
    storageFolder = `group/${groupId}`;
  } else if (scope.startsWith("dm:")) {
    const conversationId = scope.slice("dm:".length);
    const { data: conversation } = await supabase
      .from("DirectConversation")
      .select("id, userAId, userBId")
      .eq("id", conversationId)
      .maybeSingle();
    if (
      !conversation ||
      (user.id !== conversation.userAId && user.id !== conversation.userBId)
    ) {
      throw new Error("You don't have access to this conversation.");
    }
    storageFolder = `dm/${conversationId}`;
  } else {
    throw new Error("Invalid upload target.");
  }

  const storageClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    await storageClient.storage.createBucket(STORAGE_BUCKET, { public: true });
  } catch {
    // Bucket already exists — fine.
  }

  const storagePath = `${storageFolder}/${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await storageClient.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrlData } = storageClient.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return {
    url: publicUrlData.publicUrl,
    type: file.type || `application/${extension}`,
    name: file.name,
    size: file.size,
  };
}

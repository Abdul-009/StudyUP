"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "chat-attachments";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // images, documents, archives
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // Supabase's default per-file ceiling

const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
};

// Permissive allow-list: images, video and common document/archive types,
// matching the kinds of things you'd share in WhatsApp. Executables and
// scripts are excluded.
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "svg",
  ...Object.keys(VIDEO_TYPES),
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

export type PreparedChatUpload = {
  bucket: string;
  path: string;
  token: string;
  publicUrl: string;
  contentType: string;
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
 * Validate an upload and hand back a signed upload token. The browser then
 * sends the file straight to Storage, so it never passes through a server
 * action (Vercel rejects request bodies over ~4.5MB, which broke any larger
 * image or PDF and made video impossible).
 *
 * scope: "group:<groupId>" | "dm:<conversationId>"
 */
export async function prepareChatUpload(input: {
  name: string;
  size: number;
  type: string;
  scope: string;
}): Promise<PreparedChatUpload> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to upload.");
  }

  const extension = input.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("That file type is not supported.");
  }

  const isVideo = extension in VIDEO_TYPES;
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_ATTACHMENT_SIZE;
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new Error("That file is empty.");
  }
  if (input.size > maxSize) {
    throw new Error(`${isVideo ? "Videos" : "Attachments"} must be ${maxSize / (1024 * 1024)}MB or less.`);
  }

  const scope = input.scope.trim();
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

  // Create the bucket on first use; if it already exists, make sure it allows
  // video-sized files.
  const bucketOptions = { public: true, fileSizeLimit: MAX_VIDEO_SIZE };
  const { error: createBucketError } = await storageClient.storage.createBucket(STORAGE_BUCKET, bucketOptions);
  if (createBucketError) {
    await storageClient.storage.updateBucket(STORAGE_BUCKET, bucketOptions);
  }

  const path = `${storageFolder}/${sanitizeFileName(input.name)}`;
  const { data: signed, error: signedError } = await storageClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);

  if (signedError || !signed) {
    throw new Error(signedError?.message || "Couldn't start the upload.");
  }

  const { data: publicUrlData } = storageClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  return {
    bucket: STORAGE_BUCKET,
    path,
    token: signed.token,
    publicUrl: publicUrlData.publicUrl,
    contentType: VIDEO_TYPES[extension] ?? (input.type || `application/${extension}`),
  };
}

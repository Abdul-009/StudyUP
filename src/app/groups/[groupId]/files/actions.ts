"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "group-files";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["pdf", "doc", "docx", "ppt", "pptx", "jpg", "png"]);

function sanitizeFileName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const baseName = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${baseName || "file"}-${Date.now()}-${Math.random().toString(36).slice(2)}${extension ? `.${extension}` : ""}`;
}

export async function uploadGroupFile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to upload files.");
  }

  const groupId = String(formData.get("groupId") || "").trim();
  const file = formData.get("file");

  if (!groupId) {
    throw new Error("A group is required.");
  }

  if (!(file instanceof File)) {
    throw new Error("Please choose a file to upload.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("You must be a member of this group to upload files.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size must be 10MB or less.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_TYPES.has(extension)) {
    throw new Error("Unsupported file type. Allowed types: pdf, doc, docx, ppt, pptx, jpg, png.");
  }

  const storageClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  try {
    await storageClient.storage.createBucket(STORAGE_BUCKET, { public: true });
  } catch {
    // Ignore if the bucket already exists.
  }

  const storagePath = `groups/${groupId}/files/${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await storageClient.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrlData } = storageClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  const { error: insertError } = await supabase.from("SharedFile").insert({
    groupId,
    uploadedBy: user.id,
    fileName: file.name,
    fileUrl: publicUrlData.publicUrl,
    fileType: extension,
    fileSize: file.size,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/groups/${groupId}/files`);
  redirect(`/groups/${groupId}/files`);
}

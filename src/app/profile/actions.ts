"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  assertMaxLength,
  USER_COURSE_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  sanitizeText,
} from "@/lib/sanitize-content";

const AVATAR_BUCKET = "avatars";
// Same 10MB cap as every other upload in the app (chat attachments, group
// files) — see src/lib/chat-attachments.ts.
const MAX_AVATAR_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

// No redirect() here — both actions are called directly from a client
// component (ProfileForm) so it can show inline errors instead of a generic
// crash page on a validation failure. redirect() works by throwing a special
// control-flow signal; a client-side try/catch wrapping the call would have
// to know to let that specific throw through, which is easy to get wrong —
// simpler to just return a result and let the client call router.refresh().

export async function updateProfile(input: { name: string; course: string; yearOfStudy: string }) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to update your profile.");
  }

  const name = sanitizeText(input.name);
  const course = sanitizeText(input.course);
  const yearOfStudyRaw = input.yearOfStudy.trim();

  if (!name) {
    throw new Error("Name is required.");
  }
  assertMaxLength(name, USER_NAME_MAX_LENGTH, "Name");
  if (course) {
    assertMaxLength(course, USER_COURSE_MAX_LENGTH, "Course");
  }

  let yearOfStudy: number | null = null;
  if (yearOfStudyRaw) {
    yearOfStudy = Number(yearOfStudyRaw);
    if (!Number.isInteger(yearOfStudy) || yearOfStudy < 1) {
      throw new Error("Year of study must be a positive whole number.");
    }
  }

  const { error } = await supabase
    .from("User")
    .update({ name, course: course || null, yearOfStudy })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/profile");
  revalidatePath("/home");
  return { ok: true, name, course: course || null, yearOfStudy };
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to update your avatar.");
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || !file.size) {
    throw new Error("Please choose an image to upload.");
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("Image size must be 10MB or less.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_TYPES.has(extension)) {
    throw new Error("Unsupported image type. Allowed types: jpg, jpeg, png, webp, gif.");
  }

  const storageClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    await storageClient.storage.createBucket(AVATAR_BUCKET, { public: true });
  } catch {
    // Ignore if the bucket already exists.
  }

  const storagePath = `users/${user.id}/avatar.${extension}`;
  const { error: uploadError } = await storageClient.storage.from(AVATAR_BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrlData } = storageClient.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
  const cacheBustedUrl = `${publicUrlData.publicUrl}?updated=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("User")
    .update({ profilePicUrl: cacheBustedUrl })
    .eq("id", user.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/profile");
  revalidatePath("/home");
  return { ok: true, profilePicUrl: cacheBustedUrl };
}

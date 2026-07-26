"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to update your profile.");
  }

  const name = String(formData.get("name") || "").trim();
  const course = String(formData.get("course") || "").trim();
  const yearOfStudyRaw = String(formData.get("yearOfStudy") || "").trim();

  if (!name) {
    throw new Error("Name is required.");
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
    .update({
      name,
      course: course || null,
      yearOfStudy,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/profile");
  redirect("/profile");
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to update your avatar.");
  }

  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    throw new Error("Please choose an image to upload.");
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("Image size must be 5MB or less.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_TYPES.has(extension)) {
    throw new Error("Unsupported image type. Allowed types: jpg, jpeg, png, webp, gif.");
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
  const cacheBustedUrl = `${publicUrlData.publicUrl}?updated=${new Date().getTime()}`;

  const { error: updateError } = await supabase
    .from("User")
    .update({ profilePicUrl: cacheBustedUrl })
    .eq("id", user.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/profile");
  redirect("/profile");
}

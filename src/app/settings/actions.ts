"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const NOTIF_TYPES = ["NEW_MESSAGE", "NEW_ASSIGNMENT", "POLL_UPDATE", "ANNOUNCEMENT"] as const;

export async function updateNotificationPreferences(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to update notification preferences.");
  }

  const preferences = NOTIF_TYPES.map((type) => ({
    userId: user.id,
    type,
    enabled: formData.get(type) === "on",
  }));

  const { error } = await supabase
    .from("NotificationPreference")
    .upsert(preferences, { onConflict: "userId,type" });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
  redirect("/settings");
}

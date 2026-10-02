"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const NOTIF_TYPES = ["NEW_MESSAGE", "NEW_ASSIGNMENT", "POLL_UPDATE", "ANNOUNCEMENT"] as const;

export type PreferencesState = { saved: boolean; error: string | null };

export async function updateNotificationPreferences(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { saved: false, error: "You must be signed in to update notification preferences." };
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
    return { saved: false, error: "Couldn't save your preferences. Please try again." };
  }

  revalidatePath("/settings");
  return { saved: true, error: null };
}

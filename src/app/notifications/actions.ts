"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TYPE_ROUTES: Record<string, string> = {
  NEW_MESSAGE: "chat",
  NEW_ASSIGNMENT: "assignments",
  ANNOUNCEMENT: "announcements",
  POLL_UPDATE: "polls",
};

export async function markNotificationAsRead(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to view notifications.");
  }

  const notificationId = String(formData.get("notificationId") || "").trim();
  if (!notificationId) {
    throw new Error("A notification is required.");
  }

  const { data: notification, error: fetchError } = await supabase
    .from("Notification")
    .select("id, type, groupId")
    .eq("id", notificationId)
    .eq("userId", user.id)
    .maybeSingle();

  if (fetchError || !notification) {
    throw new Error("Notification not found.");
  }

  const { error: updateError } = await supabase
    .from("Notification")
    .update({ isRead: true })
    .eq("id", notificationId)
    .eq("userId", user.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const routeSegment = TYPE_ROUTES[notification.type];
  if (notification.groupId && routeSegment) {
    redirect(`/groups/${notification.groupId}/${routeSegment}`);
  }

  revalidatePath("/notifications");
  redirect("/notifications");
}

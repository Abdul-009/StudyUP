import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import LandingPageContent from "@/components/LandingPageContent";

export default async function RootPage() {
  const { data: { user } } = await getAuthUser();

  if (user) {
    // Redirect authenticated users to dashboard
    redirect("/home");
  }

  // For unauthenticated users, render the landing page
  return <LandingPageContent />;
}


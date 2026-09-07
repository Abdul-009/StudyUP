import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("User")
    .select("id, email, name, course, yearOfStudy, profilePicUrl")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return (
    <main className="max-w-[720px] px-4 py-6 md:px-11 md:py-9">
      <div className="mb-7">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">Profile</h1>
        <p className="mt-1 text-sm text-muted">View and update your account details.</p>
      </div>

      <ProfileForm profile={profile} />
    </main>
  );
}

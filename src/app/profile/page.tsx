import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfile, uploadAvatar } from "./actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

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
    <main className="max-w-[720px] px-11 py-9">
      <div className="mb-7">
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted">View and update your account details.</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Profile picture</h2>
        <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {profile.profilePicUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.profilePicUrl}
              alt={profile.name}
              className="h-20 w-20 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-plum font-heading text-2xl font-semibold text-white">
              {profile.name?.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <form action={uploadAvatar} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="avatar"
              accept=".jpg,.jpeg,.png,.webp,.gif"
              required
              className="block rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-sm"
            />
            <button className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">Upload</button>
          </form>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Details</h2>
        <form action={updateProfile} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-muted">
            Name
            <input
              name="name"
              defaultValue={profile.name}
              required
              className="mt-1 w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>
          <label className="text-sm text-muted">
            Email
            <input
              value={profile.email}
              disabled
              className="mt-1 w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-muted"
            />
          </label>
          <label className="text-sm text-muted">
            Course
            <input
              name="course"
              defaultValue={profile.course ?? ""}
              className="mt-1 w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>
          <label className="text-sm text-muted">
            Year of study
            <input
              type="number"
              name="yearOfStudy"
              min={1}
              max={8}
              defaultValue={profile.yearOfStudy ?? ""}
              className="mt-1 w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>
          <div className="md:col-span-2">
            <button className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">Save changes</button>
          </div>
        </form>
      </section>
    </main>
  );
}

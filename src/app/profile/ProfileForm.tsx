"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { updateProfile, uploadAvatar } from "./actions";

type Profile = {
  name: string;
  email: string;
  course: string | null;
  yearOfStudy: number | null;
  profilePicUrl: string | null;
};

export default function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [profilePicUrl, setProfilePicUrl] = useState(profile.profilePicUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [name, setName] = useState(profile.name);
  const [course, setCourse] = useState(profile.course ?? "");
  const [yearOfStudy, setYearOfStudy] = useState(profile.yearOfStudy?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    name.trim() !== profile.name ||
    course.trim() !== (profile.course ?? "") ||
    yearOfStudy.trim() !== (profile.yearOfStudy?.toString() ?? "");

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("avatar", file);
      const result = await uploadAvatar(formData);
      setProfilePicUrl(result.profilePicUrl);
      router.refresh();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Couldn't upload that image.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !dirty || saving) return;

    setSaving(true);
    setDetailsError(null);
    setSaved(false);
    try {
      await updateProfile({ name: trimmedName, course, yearOfStudy });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Couldn't update your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Profile picture</h2>
        <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {profilePicUrl ? (
            <Image
              src={profilePicUrl}
              alt={profile.name}
              width={80}
              height={80}
              className="h-20 w-20 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-border bg-plum font-heading text-2xl font-semibold text-white">
              {profile.name?.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif"
              onChange={handleAvatarChange}
              disabled={isUploading}
              className="block w-full min-w-0 max-w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-sm disabled:opacity-60 sm:w-auto"
            />
            {isUploading ? <span className="text-sm text-muted">Uploading…</span> : null}
          </div>
        </div>
        {avatarError ? <p className="mt-3 text-sm text-coral">{avatarError}</p> : null}
        <p className="mt-3 text-xs text-muted">JPG, PNG, WEBP, or GIF. Up to 10MB.</p>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Details</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-muted">
            Name
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              required
              maxLength={80}
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
              value={course}
              onChange={(event) => {
                setCourse(event.target.value);
                setSaved(false);
              }}
              maxLength={100}
              className="mt-1 w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>
          <label className="text-sm text-muted">
            Year of study
            <input
              type="number"
              min={1}
              max={8}
              value={yearOfStudy}
              onChange={(event) => {
                setYearOfStudy(event.target.value);
                setSaved(false);
              }}
              className="mt-1 w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>

          {detailsError ? <p className="text-sm text-coral md:col-span-2">{detailsError}</p> : null}
          {saved ? <p className="text-sm text-sage md:col-span-2">Saved.</p> : null}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!dirty || saving || !name.trim()}
              className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

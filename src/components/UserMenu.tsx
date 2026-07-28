"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserMenuProps = {
  userName: string;
  userCourse: string | null;
  userYearOfStudy: number | null;
  userProfilePicUrl: string | null;
};

export default function UserMenu({ userName, userCourse, userYearOfStudy, userProfilePicUrl }: UserMenuProps) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [open, setOpen] = useState(false);

  const initial = (userName || "?").charAt(0).toUpperCase();
  const subtitle = [userCourse, userYearOfStudy ? `Year ${userYearOfStudy}` : null].filter(Boolean).join(", ");

  async function handleLogout() {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-white p-1.5 shadow-lg">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            {userProfilePicUrl ? (
              <Image
                src={userProfilePicUrl}
                alt={userName}
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-plum font-heading text-sm font-semibold text-white">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-foreground">{userName}</div>
              {subtitle ? <div className="truncate text-xs text-muted">{subtitle}</div> : null}
            </div>
          </div>

          <div className="my-1 border-t border-border" />

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-recessed"
          >
            Profile
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-recessed"
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-coral hover:bg-surface-recessed"
          >
            Log out
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Account menu"
        className="flex items-center"
      >
        {userProfilePicUrl ? (
          <Image
            src={userProfilePicUrl}
            alt={userName}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum font-heading text-[13px] font-semibold text-white">
            {initial}
          </div>
        )}
      </button>
    </div>
  );
}

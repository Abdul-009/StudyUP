"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-[10px] bg-coral px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading ? "Signing out..." : "Log out"}
    </button>
  );
}

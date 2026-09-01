import type { Metadata } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import UserMenu from "@/components/UserMenu";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "StudyUp",
  description: "Your study group's chat, files, assignments and scheduling in one place",
  applicationName: "StudyUp",
  appleWebApp: { capable: true, title: "StudyUp", statusBarStyle: "default" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await getAuthUser();

  let unreadCount = 0;
  let profile: { name: string; course: string | null; yearOfStudy: number | null; profilePicUrl: string | null } | null = null;
  let fallbackGroupId: string | null = null;

  if (user) {
    const [{ count }, { data: profileRow }, { data: membership }] = await Promise.all([
      supabase
        .from("Notification")
        .select("id", { count: "exact", head: true })
        .eq("userId", user.id)
        .eq("isRead", false),
      supabase
        .from("User")
        .select("name, course, yearOfStudy, profilePicUrl")
        .eq("id", user.id)
        .single(),
      supabase
        .from("GroupMember")
        .select("groupId")
        .eq("userId", user.id)
        .order("joinedAt", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    unreadCount = count ?? 0;
    profile = profileRow ?? null;
    fallbackGroupId = membership?.groupId ?? null;
  }

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden md:flex-row">
        {user ? (
          <Sidebar
            userId={user.id}
            userName={profile?.name || "Your account"}
            userCourse={profile?.course ?? null}
            userYearOfStudy={profile?.yearOfStudy ?? null}
            userProfilePicUrl={profile?.profilePicUrl ?? null}
            unreadCount={unreadCount}
            fallbackGroupId={fallbackGroupId}
          />
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {user ? (
            <div className="hidden shrink-0 items-center justify-end border-b border-border bg-surface px-6 py-2.5 md:flex">
              <UserMenu
                userName={profile?.name || "Your account"}
                userCourse={profile?.course ?? null}
                userYearOfStudy={profile?.yearOfStudy ?? null}
                userProfilePicUrl={profile?.profilePicUrl ?? null}
              />
            </div>
          ) : null}
          <div className={`min-h-0 flex-1 overflow-y-auto ${user ? "pb-16 md:pb-0" : ""}`}>{children}</div>
        </div>
      </body>
    </html>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import GroupSettingsForm from "./GroupSettingsForm";

export default async function GroupSettingsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("GroupMember")
    .select("role")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/home");
  }

  const { data: group } = await supabase
    .from("Group")
    .select("id, name, isPrivate")
    .eq("id", groupId)
    .single();

  if (!group) {
    redirect("/home");
  }

  const isAdmin = membership.role === "ADMIN";

  return (
    <main className="max-w-[640px] px-4 py-6 md:px-11 md:py-9">
      <Link
        href={`/groups/${groupId}/chat`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Back to chat
      </Link>

      <div className="mb-7">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground md:text-[32px]">Group settings</h1>
        <p className="mt-1 text-sm text-muted">
          {group.isPrivate ? "Private group" : "Public group"}
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Name</h2>
        <GroupSettingsForm groupId={groupId} initialName={group.name} canEdit={isAdmin} />
      </section>
    </main>
  );
}

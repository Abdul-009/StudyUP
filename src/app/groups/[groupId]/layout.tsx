import GroupSubNav from "@/components/GroupSubNav";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GroupSubNav groupId={groupId} />
      {children}
    </div>
  );
}

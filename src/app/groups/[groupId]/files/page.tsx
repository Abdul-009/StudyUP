import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { uploadGroupFile } from "./actions";

type FileRecord = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  createdAt: string;
  uploadedBy: string;
  uploader: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export default async function GroupFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams?: Promise<{ type?: string }>;
}) {
  const { groupId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const fileTypeFilter = typeof resolvedSearchParams.type === "string" ? resolvedSearchParams.type : "";

  const supabase = await createClient();
  const { data: { user }, error } = await getAuthUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("GroupMember")
    .select("id")
    .eq("groupId", groupId)
    .eq("userId", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/home");
  }

  let filesQuery = supabase
    .from("SharedFile")
    .select("id, fileName, fileType, fileSize, fileUrl, createdAt, uploadedBy")
    .eq("groupId", groupId)
    .order("createdAt", { ascending: false });

  if (fileTypeFilter) {
    filesQuery = filesQuery.eq("fileType", fileTypeFilter);
  }

  const { data: files } = await filesQuery;
  const uploaderIds = Array.from(new Set((files ?? []).map((file) => file.uploadedBy)));
  let userMap: Record<string, { id: string; name: string; email: string }> = {};

  if (uploaderIds.length) {
    const { data: users } = await supabase.from("User").select("id, name, email").in("id", uploaderIds);
    userMap = Object.fromEntries((users ?? []).map((userRow) => [userRow.id, userRow]));
  }

  const fileListings: FileRecord[] = (files ?? []).map((file) => ({
    id: file.id,
    fileName: file.fileName,
    fileType: file.fileType,
    fileSize: file.fileSize,
    fileUrl: file.fileUrl,
    createdAt: file.createdAt,
    uploadedBy: file.uploadedBy,
    uploader: userMap[file.uploadedBy] ?? null,
  }));

  return (
    <main className="max-w-[820px] px-11 py-9">
      <div className="mb-7">
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-foreground">Shared files</h1>
        <p className="mt-1 text-sm text-muted">Upload documents and images, then browse them by type.</p>
      </div>

      <section className="mb-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Upload a file</h2>
        <form action={uploadGroupFile} className="mt-4 space-y-3">
          <input type="hidden" name="groupId" value={groupId} />
          <input
            type="file"
            name="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.png"
            required
            className="block w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2"
          />
          <p className="text-sm text-muted">Max size: 10MB. Allowed types: pdf, doc, docx, ppt, pptx, jpg, png.</p>
          <button className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">Upload</button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Files</h2>
            <p className="text-sm text-muted">Filter by file type.</p>
          </div>
          <form method="get" className="flex gap-2">
            <input type="hidden" name="groupId" value={groupId} />
            <select name="type" defaultValue={fileTypeFilter} className="rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground">
              <option value="">All types</option>
              <option value="pdf">PDF</option>
              <option value="doc">DOC</option>
              <option value="docx">DOCX</option>
              <option value="ppt">PPT</option>
              <option value="pptx">PPTX</option>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
            </select>
            <button className="rounded-[10px] border border-border px-3 py-2 text-sm text-foreground hover:bg-surface-recessed">Filter</button>
          </form>
        </div>

        <div className="mt-4 space-y-3">
          {fileListings.length ? (
            fileListings.map((file) => (
              <div key={file.id} className="rounded-xl border border-border bg-surface-recessed p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <a href={file.fileUrl} target="_blank" rel="noreferrer" className="font-medium text-brand">
                      {file.fileName}
                    </a>
                    <p className="mt-1 text-sm text-muted">
                      {file.fileType.toUpperCase()} • {file.fileSize} bytes • {file.uploader?.name || "Unknown uploader"}
                    </p>
                  </div>
                  <div className="font-mono text-xs text-muted">
                    <p>{new Date(file.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">No files uploaded yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}

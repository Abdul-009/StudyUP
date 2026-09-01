"use client";

import { FileText, Download } from "lucide-react";

type MessageAttachmentProps = {
  url: string;
  type: string | null;
  name: string | null;
  size: number | null;
  /** true when rendered inside the current user's own (dark) bubble */
  onDark?: boolean;
};

function formatSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageAttachment({ url, type, name, size, onDark }: MessageAttachmentProps) {
  const isImage = (type ?? "").startsWith("image/");

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name ?? "Image attachment"}
          className="max-h-72 w-auto max-w-full rounded-lg object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={name ?? undefined}
      className={`mt-1 flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        onDark
          ? "border-white/25 bg-white/10 hover:bg-white/20"
          : "border-border bg-surface hover:bg-surface-recessed"
      }`}
    >
      <FileText size={22} className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name ?? "Attachment"}</span>
        {formatSize(size) ? (
          <span className={`block text-[11px] ${onDark ? "text-white/70" : "text-muted"}`}>
            {formatSize(size)}
          </span>
        ) : null}
      </span>
      <Download size={16} className="shrink-0 opacity-70" />
    </a>
  );
}

"use client";

// Server components format dates in the server's timezone/locale (UTC on the
// host), so times looked wrong for everyone else. Formatting in the browser
// uses the viewer's own timezone.
export default function LocalTime({
  iso,
  variant = "full",
  className,
}: {
  iso: string;
  variant?: "full" | "preview";
  className?: string;
}) {
  const date = new Date(iso);
  let text: string;
  if (variant === "preview") {
    text =
      date.toDateString() === new Date().toDateString()
        ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : date.toLocaleDateString([], { month: "short", day: "numeric" });
  } else {
    text = date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  return (
    <time dateTime={iso} suppressHydrationWarning className={className}>
      {text}
    </time>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link
        href="/home"
        className="mt-2 rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
      >
        Go home
      </Link>
    </div>
  );
}

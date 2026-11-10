// Phase 3 (C1, build decision 2): an INITIALS avatar. Real picture upload is deferred (it needs an
// image-storage decision — file size/type limits, where bytes live — not worth it this phase).
// Pure presentation, so it works in server and client components alike.

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function Avatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-kq-red font-semibold text-white ${box}`}
    >
      {initialsOf(name)}
    </span>
  );
}

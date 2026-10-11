import type { Rag as RagValue } from "@/lib/pipeline";

const ICON: Record<RagValue | "Pending", string> = { Green: "✓", Amber: "!", Red: "✕", Pending: "…" };

export function Rag({ value, label }: { value: RagValue | "Pending"; label?: string }) {
  return (
    <span className={`rag ${value}`}>
      <span className="dot" aria-hidden />
      <span aria-hidden>{ICON[value]}</span>
      {label ?? value}
    </span>
  );
}

/**
 * One heatmap cell on a single-hue blue ramp: darker means higher. The value is always printed, and
 * cells under the threshold get a red outline plus a "below threshold" note in the tooltip.
 */
export function HeatCell({ pct, title, under, max = 100 }: { pct: number | undefined; title: string; under?: boolean; max?: number }) {
  if (pct === undefined) return <td className="c empty" title={`${title}: no data`}>–</td>;
  const share = Math.min(1, Math.max(0, pct / max));
  const mix = Math.round(8 + share * 84);
  return (
    <td
      className={`c${under ? " under" : ""}`}
      title={`${title}: ${pct}%${under ? " (below threshold)" : ""}`}
      style={{ background: `color-mix(in srgb, var(--bar) ${mix}%, var(--surface))`, color: share >= 0.6 ? "#fff" : "var(--text)" }}
    >
      {pct}
    </td>
  );
}

export function HeatLegend({ underLabel }: { underLabel?: string }) {
  return (
    <div className="legend" aria-hidden>
      {[0, 25, 50, 75, 100].map((p) => (
        <span key={p}>
          <span className="sw" style={{ background: `color-mix(in srgb, var(--bar) ${Math.round(8 + (p / 100) * 84)}%, var(--surface))` }} />
          {p}%
        </span>
      ))}
      {underLabel && (
        <span>
          <span className="sw" style={{ boxShadow: "inset 0 0 0 2px var(--critical)" }} />
          {underLabel}
        </span>
      )}
    </div>
  );
}

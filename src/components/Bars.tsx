// Single-series horizontal bars: one hue, value labels at the bar end, a native tooltip per row.
export type Bar = { label: string; value: number; display: string; tooltip?: string; href?: string; muted?: boolean };

export function Bars({ rows, ariaLabel }: { rows: Bar[]; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars" role="table" aria-label={ariaLabel}>
      {rows.map((r) => (
        <div className="row" role="row" key={r.label} title={r.tooltip ?? `${r.label}: ${r.display}`}>
          <span className="lbl" role="rowheader">
            {r.href ? <a href={r.href}>{r.label}</a> : r.label}
          </span>
          <span className="track" role="cell">
            {r.value > 0 && <span className={`fill${r.muted ? " muted" : ""}`} style={{ width: `${(r.value / max) * 100}%`, display: "block" }} />}
          </span>
          <span className="val" role="cell">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

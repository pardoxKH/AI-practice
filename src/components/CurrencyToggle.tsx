import { setCurrency } from "@/app/actions";
import { CURRENCIES, type Currency } from "@/lib/domain";

export function CurrencyToggle({ current }: { current: Currency }) {
  return (
    <form action={setCurrency} className="seg" aria-label="Reporting currency">
      {CURRENCIES.map((c) => (
        <button key={c} name="ccy" value={c} aria-pressed={c === current} type="submit">
          {c}
        </button>
      ))}
    </form>
  );
}

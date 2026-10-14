"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ImportState } from "@/app/actions";

type Action = (state: ImportState, fd: FormData) => Promise<ImportState>;

/** A small form bound to a server action: shows its error or confirmation and clears itself after a save. */
export function ActionForm({
  action,
  children,
  submit,
  className = "inline-form",
}: {
  action: Action;
  children: React.ReactNode;
  submit: string;
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : submit}</button>
      {(state?.error || state?.ok) && (
        <div className={`notice ${state.error ? "err" : "ok"}`} role="status" style={{ flexBasis: "100%", margin: 0 }}>
          {state.error ?? state.ok}
          {state.details && (
            <ul className="small" style={{ margin: "6px 0 0" }}>
              {state.details.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  err,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  err?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {label ? <label className="label">{label}</label> : null}
      {children}
      {hint && !err ? <div className="field__hint">{hint}</div> : null}
      {err ? <div className="field__err">{err}</div> : null}
    </div>
  );
}

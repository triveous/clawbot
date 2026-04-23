import type { ReactNode } from "react";

export function SectionCard({
  title,
  sub,
  actions,
  children,
  foot,
  pad = true,
  className = "",
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  foot?: ReactNode;
  pad?: boolean;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      {title ? (
        <div className="card__head">
          <div style={{ flex: 1 }}>
            <div className="card__title">{title}</div>
            {sub ? <div className="card__sub">{sub}</div> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={pad ? "card__body" : ""}>{children}</div>
      {foot ? <div className="card__foot">{foot}</div> : null}
    </div>
  );
}

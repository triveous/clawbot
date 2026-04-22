import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function EmptyStage({
  icon,
  title,
  stage,
  children,
}: {
  icon: IconName;
  title: string;
  stage: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-empty">
      <div className="page-empty__icon">
        <Icon name={icon} size={28} />
      </div>
      <div className="page-empty__title">{title}</div>
      <div className="page-empty__sub">{stage}</div>
      {children ? <div className="page-empty__body">{children}</div> : null}
      <style>{`
        .page-empty {
          max-width: 480px;
          margin: 72px auto;
          padding: 32px;
          text-align: center;
          color: var(--muted-foreground);
        }
        .page-empty__icon {
          width: 56px; height: 56px;
          border-radius: 14px;
          background: color-mix(in oklab, var(--primary) 14%, transparent);
          color: var(--primary);
          display: grid; place-items: center;
          margin: 0 auto 18px;
        }
        .page-empty__title {
          font-family: var(--font-instrument-serif);
          font-size: 28px;
          line-height: 1.15;
          color: var(--foreground);
          margin-bottom: 6px;
        }
        .page-empty__sub {
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-family: var(--font-geist-mono);
          color: var(--muted-foreground);
        }
        .page-empty__body {
          margin-top: 20px;
          font-size: 14px;
          line-height: 1.55;
        }
      `}</style>
    </div>
  );
}

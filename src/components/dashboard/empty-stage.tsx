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
    <div className="mx-auto my-18 max-w-[480px] p-8 text-center text-muted-foreground">
      <div className="mx-auto mb-[18px] grid size-14 place-items-center rounded-[14px] bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-primary">
        <Icon name={icon} size={28} />
      </div>
      <div className="mb-1.5 font-[var(--font-instrument-serif)] text-[28px] leading-[1.15] text-foreground">
        {title}
      </div>
      <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
        {stage}
      </div>
      {children ? (
        <div className="mt-5 text-sm leading-[1.55]">{children}</div>
      ) : null}
    </div>
  );
}

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type CalloutKind = "default" | "info" | "ok" | "warn" | "danger";

export function Callout({
  kind = "default",
  icon = "info",
  title,
  children,
}: {
  kind?: CalloutKind;
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`callout callout--${kind}`}>
      <div className="icon" style={{ flexShrink: 0 }}>
        <Icon name={icon} size={16} />
      </div>
      <div className="callout__body">
        {title ? <div className="callout__title">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

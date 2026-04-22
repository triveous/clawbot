import type { CSSProperties, ReactNode } from "react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  fullWidth,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentedOption<T>[];
  className?: string;
  fullWidth?: boolean;
}) {
  const style: CSSProperties | undefined = fullWidth ? { width: "100%" } : undefined;
  return (
    <div className={`seg${className ? ` ${className}` : ""}`} style={style}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`seg__item${value === opt.value ? " is-active" : ""}`}
          onClick={() => onChange(opt.value)}
          style={fullWidth ? { flex: 1, textAlign: "center" } : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

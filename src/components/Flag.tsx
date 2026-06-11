import type { CSSProperties } from "react";

interface Props {
  code:       string | null | undefined;
  className?: string;
  style?:     CSSProperties;
}

export function Flag({ code, className = "", style }: Props) {
  if (!code) {
    return (
      <span
        className={`inline-block rounded-sm bg-gray-200 ${className}`}
        style={{ width: "1.25rem", height: "0.9rem", verticalAlign: "middle", ...style }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`fi fi-${code} ${className}`}
      style={{ verticalAlign: "middle", ...style }}
      aria-hidden
    />
  );
}

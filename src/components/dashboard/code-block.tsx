"use client";

import { useState } from "react";
import { Icon } from "./icon";

export function CodeBlock({ code, prompt = "$" }: { code: string; prompt?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="codeblock">
      <span className="prompt">{prompt}</span>
      <span style={{ flex: 1, whiteSpace: "pre", overflowX: "auto" }}>{code}</span>
      <button className="btn btn--ghost btn--sm copy" onClick={copy} type="button">
        <Icon name={copied ? "check" : "copy"} size={12} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

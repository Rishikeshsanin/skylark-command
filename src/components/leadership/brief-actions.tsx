"use client";

import { useState } from "react";

export function BriefActions({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  async function copyBrief() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  function downloadBrief() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "skylark-leadership-brief.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <div className="action-row"><button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Refresh</button><button className="button button-secondary" type="button" onClick={copyBrief}>{copied ? "Copied" : "Copy"}</button><button className="button button-primary" type="button" onClick={downloadBrief}>Download Markdown</button></div>;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./copilot-visual-polish.css";
import "./copilot-quality.css";
import "./product-polish.css";
import "./change-intelligence.css";
import "./v2-design-system.css";
import "./v2-trust-grammar.css";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Skylark Command",
    template: "%s · Skylark Command",
  },
  description:
    "Founder intelligence and business operations copilot for live monday.com data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

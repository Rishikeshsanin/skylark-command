import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: { default: "Skylark Command", template: "%s · Skylark Command" }, description: "Founder intelligence and business operations copilot for live monday.com data." };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) { return <html lang="en"><body><AppShell>{children}</AppShell></body></html>; }

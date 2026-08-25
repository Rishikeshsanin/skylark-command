import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skylark Command",
  description:
    "AI-powered business intelligence copilot for live monday.com sales and operations data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

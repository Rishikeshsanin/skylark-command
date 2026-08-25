"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label, shortLabel }: { href: string; label: string; shortLabel?: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link className={`nav-link${active ? " nav-link-active" : ""}`} href={href} aria-current={active ? "page" : undefined}>
      <span className="nav-marker" aria-hidden="true" />
      <span className="nav-label">{label}</span>
      {shortLabel && <span className="nav-short-label">{shortLabel}</span>}
    </Link>
  );
}

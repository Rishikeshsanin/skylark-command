import type { ReactNode } from "react";
import Link from "next/link";
import { NavLink } from "./nav-link";

const navigation = [
  { href: "/", label: "Overview", shortLabel: "Overview" },
  { href: "/copilot", label: "Founder Copilot", shortLabel: "Copilot" },
  { href: "/pipeline", label: "Pipeline", shortLabel: "Pipeline" },
  { href: "/operations", label: "Operations", shortLabel: "Ops" },
  { href: "/leadership", label: "Leadership Brief", shortLabel: "Brief" },
  { href: "/data-health", label: "Data Health", shortLabel: "Health" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar" aria-label="Primary navigation">
        <Link className="brand-block brand-link" href="/" aria-label="Skylark Command home">
          <div className="brand-mark" aria-hidden="true">SC</div>
          <div>
            <p className="brand-name">Skylark Command</p>
            <p className="brand-subtitle">Founder Intelligence</p>
          </div>
        </Link>
        <nav className="sidebar-nav">
          {navigation.map((item) => <NavLink key={item.href} {...item} />)}
        </nav>
        <div className="sidebar-footer">
          <span className="live-dot" aria-hidden="true" />
          <div>
            <p>monday.com connected architecture</p>
            <span>Read-only business intelligence</span>
          </div>
        </div>
      </aside>

      <div className="mobile-header">
        <Link className="mobile-brand brand-link" href="/" aria-label="Skylark Command home">
          <div className="brand-mark" aria-hidden="true">SC</div>
          <div><strong>Skylark Command</strong><span>Founder Intelligence</span></div>
        </Link>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map((item) => <NavLink key={item.href} {...item} />)}
      </nav>

      <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}

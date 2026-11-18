"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { workspaceAllowsModule, type BusinessWorkspaceConfig } from "@/lib/workspace/config";

export default function WorkspaceNavigation({
  businessId,
  workspaceConfig,
}: {
  businessId: string;
  workspaceConfig: BusinessWorkspaceConfig | null;
}) {
  const base = `/app/workspace/${businessId}`;
  const pathname = usePathname();
  const sections = [
    {
      label: "GUUDMAR",
      links: [{ path: base, label: "Dashboard", glyph: "▦" }],
    },
    {
      label: "HAWLAHA",
      links: [
        { path: `${base}/products`, label: "Alaab & kayd", glyph: "▤" },
        { path: `${base}/sales`, label: "Iibka", glyph: "↗" },
        { path: `${base}/invoices`, label: "Invoices", glyph: "▧" },
        { path: `${base}/customers`, label: "Macaamiisha", glyph: "♙" },
        { path: `${base}/suppliers`, label: "Alaab-qeybiyeyaasha", glyph: "⇄" },
        { path: `${base}/branches`, label: "Laamaha", glyph: "⌂" },
      ],
    },
    {
      label: "MAAMUL",
      links: [
        { path: `${base}/team`, label: "Kooxda & rukhsadaha", glyph: "♟" },
        { path: `${base}/reports`, label: "Warbixinnada", glyph: "▥" },
        { path: `${base}/settings`, label: "Dejimaha", glyph: "⚙" },
        { path: `${base}/support`, label: "WhatsApp Support", glyph: "◉", alwaysAvailable: true },
      ],
    },
  ];

  return (
    <nav className="workspace-nav" aria-label="Business workspace">
      {sections.map((section) => (
        <div className="workspace-nav-section" key={section.label}>
          <span className="workspace-nav-section-label">{section.label}</span>
          {section.links.filter((link) => ("alwaysAvailable" in link && link.alwaysAvailable) || workspaceAllowsModule(workspaceConfig, link.path === base ? "dashboard" : link.path.slice(base.length + 1))).map((link) => {
            const active = link.path === base
              ? pathname === base
              : pathname === link.path || pathname.startsWith(`${link.path}/`);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={active ? "workspace-nav-active" : undefined}
                href={link.path}
                key={link.path}
                prefetch={true}
              >
                <span className="workspace-nav-glyph" aria-hidden="true">{link.glyph}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

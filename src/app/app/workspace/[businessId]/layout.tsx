import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireBusinessMember } from "@/lib/auth/authorization";
import { loadBusinessWorkspaceConfig } from "@/lib/workspace/config";
import BusinessPresenceTracker from "@/components/auth/business-presence-tracker";
import BusinessLogoutButton from "./logout-button";
import WorkspaceNavigation from "./navigation";

export default function BusinessWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <BusinessWorkspaceContent params={params}>{children}</BusinessWorkspaceContent>
    </Suspense>
  );
}

async function BusinessWorkspaceContent({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  await connection();
  const { businessId } = await params;
  const { business, membership, supabase } = await requireBusinessMember(businessId);
  const { config } = await loadBusinessWorkspaceConfig(supabase, business.id);
  const theme = config?.configuration.theme;
  const workspaceStyle = {
    ...(theme?.primaryColor ? { "--business-blue": theme.primaryColor } : {}),
    ...(theme?.backgroundColor ? { "--business-canvas": theme.backgroundColor } : {}),
    ...(theme?.accentColor ? { "--business-accent": theme.accentColor } : {}),
  } as CSSProperties;

  return (
    <main
      className={`business-workspace${config?.configuration.layout === "compact" ? " business-workspace-compact" : ""}${config?.configuration.sidebar === "soft" ? " business-workspace-soft-sidebar" : ""}`}
      style={workspaceStyle}
    >
      <BusinessPresenceTracker businessId={business.id} />
      <aside className="business-sidebar">
        <Link className="brand sidebar-brand" href="/app"><span className="brand-mark">V</span><span>VELTO</span></Link>
        <div className="workspace-identity">
          <span className="workspace-avatar">{business.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{business.name}</strong><small>{business.category}</small></div>
          <span className="workspace-identity-chevron" aria-hidden="true">⌄</span>
        </div>
        <div className="sidebar-caption">GANACSIGAAGA</div>
        <WorkspaceNavigation businessId={businessId} workspaceConfig={config} />
        <div className="business-sidebar-bottom">
          <div className="sidebar-admin-avatar">{membership.role.slice(0, 1).toUpperCase()}</div>
          <div className="sidebar-admin-info"><strong>{membership.role.replaceAll("_", " ")}</strong><span>Xubin firfircoon</span></div>
          <BusinessLogoutButton businessId={business.id} />
        </div>
      </aside>
      <section className="business-main">
        <header className="business-topbar">
          <div className="breadcrumbs"><span>{business.name}</span><i>/</i><strong>Business workspace</strong></div>
          <span className="environment-badge business-environment-badge"><i /> Xogtaadu waa ammaan</span>
        </header>
        {children}
        <Link
          aria-label="Fur WhatsApp Support"
          className="workspace-support-float"
          href={`/app/workspace/${business.id}/support`}
        >
          <span aria-hidden="true">WA</span>
          <strong>Support</strong>
        </Link>
      </section>
    </main>
  );
}

function WorkspaceLoading() {
  return (
    <main className="business-workspace">
      <section className="business-main">
        <div className="business-content" aria-live="polite">
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">BUSINESS WORKSPACE</div>
              <h1>Workspace-ka waa la furayaa.</h1>
              <p>Sug inta akoonka iyo ganacsiga la xaqiijinayo.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

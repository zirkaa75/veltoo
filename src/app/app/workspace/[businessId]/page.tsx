import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireBusinessMember } from "@/lib/auth/authorization";
import { loadBusinessWorkspaceConfig, workspaceAllowsModule } from "@/lib/workspace/config";

export const instant = true;

export default function BusinessWorkspaceDashboard({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <BusinessWorkspaceDashboardContent params={params} />
    </Suspense>
  );
}

async function BusinessWorkspaceDashboardContent({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  await connection();
  const { businessId } = await params;
  const { business, membership, user, supabase } = await requireBusinessMember(businessId);
  const { config: workspaceConfig, error: workspaceConfigError } = await loadBusinessWorkspaceConfig(supabase, business.id);
  if (workspaceConfigError) {
    return (
      <main className="business-content">
        <div className="admin-error-panel" role="alert">
          <strong>Workspace configuration lama xaqiijin karin.</strong>
          <span>{workspaceConfigError.message}</span>
        </div>
      </main>
    );
  }
  const widgetEnabled = (widget: string) =>
    !workspaceConfig?.configuration.dashboardWidgets
    || workspaceConfig.configuration.dashboardWidgets.includes(widget);
  const canShowProducts = workspaceAllowsModule(workspaceConfig, "products");
  const canShowCustomers = workspaceAllowsModule(workspaceConfig, "customers");
  const canShowBranches = workspaceAllowsModule(workspaceConfig, "branches");
  const canShowSales = workspaceAllowsModule(workspaceConfig, "sales");
  const canShowProductCount = canShowProducts && widgetEnabled("products");
  const canShowOutOfStock = canShowProducts && widgetEnabled("out_of_stock");
  const canShowCustomerCount = canShowCustomers && widgetEnabled("customers");
  const canShowBranchCount = canShowBranches && widgetEnabled("branches");
  const canShowRecentSales = canShowSales && widgetEnabled("recent_sales");
  const permissions = await Promise.all([
    supabase.rpc("has_business_permission", { target_business_id: business.id, target_resource: "products", target_action: "view" }),
    supabase.rpc("has_business_permission", { target_business_id: business.id, target_resource: "customers", target_action: "view" }),
    supabase.rpc("has_business_permission", { target_business_id: business.id, target_resource: "branches", target_action: "view" }),
    supabase.rpc("has_business_permission", { target_business_id: business.id, target_resource: "sales", target_action: "view" }),
  ]);
  const [productAccess, customerAccess, branchAccess, salesAccess] = permissions;
  const permissionError = permissions.find((permission) => permission.error)?.error;

  const [products, outOfStock, customers, branches, sales] = await Promise.all([
    productAccess.data && canShowProducts
      ? supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id)
      : Promise.resolve(null),
    productAccess.data && canShowProducts
      ? supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id).lte("quantity", 0)
      : Promise.resolve(null),
    customerAccess.data && canShowCustomers
      ? supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", business.id)
      : Promise.resolve(null),
    branchAccess.data && canShowBranches
      ? supabase.from("branches").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "active")
      : Promise.resolve(null),
    salesAccess.data && canShowSales
      ? supabase.from("sales")
        .select("id,invoice_number,total,status,sold_at", { count: "exact" })
        .eq("business_id", business.id)
        .order("sold_at", { ascending: false })
        .limit(5)
      : Promise.resolve(null),
  ]);
  const queryError = permissionError ?? products?.error ?? outOfStock?.error ?? customers?.error ?? branches?.error ?? sales?.error;
  const base = `/app/workspace/${business.id}`;
  const shortcuts = [
    productAccess.data && canShowProducts && { href: `${base}/products`, glyph: "▤", label: "Alaab & kayd", detail: "Maamul alaabta iyo tirada kaydka" },
    salesAccess.data && canShowSales && { href: `${base}/sales`, glyph: "↗", label: "Iibka", detail: "Samee iib oo eeg taariikhda" },
    customerAccess.data && canShowCustomers && { href: `${base}/customers`, glyph: "♙", label: "Macaamiisha", detail: "Diiwaangeli macaamiisha" },
    branchAccess.data && canShowBranches && { href: `${base}/branches`, glyph: "⌂", label: "Laamaha", detail: "La soco laamaha ganacsiga" },
  ].filter((shortcut): shortcut is NonNullable<typeof shortcut> => Boolean(shortcut));

  return (
    <main className="business-content">
      <div className="business-dashboard-heading">
        <div>
          <div className="page-eyebrow">BUSINESS WORKSPACE · {business.category.toUpperCase()}</div>
          <h1>Ku soo dhowow, {business.name}.</h1>
          <p>Halkan ka maamul hawlaha maalinlaha ah ee ganacsigaaga.</p>
        </div>
        <span className="business-status-pill"><i />{business.status}</span>
      </div>

      <section
        className="business-welcome-banner"
        style={workspaceConfig?.configuration.theme?.primaryColor
          ? { background: `linear-gradient(115deg, ${workspaceConfig.configuration.theme.primaryColor}, ${workspaceConfig.configuration.theme.primaryColor}dd)` }
          : undefined}
      >
        <div className="business-welcome-copy">
          <span className="business-welcome-label">MEESHAADA SHAQADA</span>
          <h2>Ganacsigaaga. Hal meel.</h2>
          <p>Xogta iyo hawlaha aad halkan ku aragto waxay ku kooban yihiin business-kan.</p>
        </div>
        <div className="business-welcome-account">
          <span className="business-account-avatar">{(user.email?.[0] ?? "B").toUpperCase()}</span>
          <span><strong>{membership.role.replaceAll("_", " ")}</strong><small>{user.email}</small></span>
        </div>
      </section>

      {queryError ? (
        <div className="admin-error-panel" role="alert">
          <strong>Dashboard xogtiisa lama akhrin karin.</strong>
          <span>{queryError.message}</span>
        </div>
      ) : (
        <>
          <section className="business-metric-grid" aria-label="Business summary">
            {canShowProductCount && <MetricCard label="ALAABTA" value={productAccess.data ? products?.count ?? 0 : "—"} note="Diiwaanka alaabta" glyph="▤" href={productAccess.data ? `${base}/products` : undefined} />}
            {canShowOutOfStock && <MetricCard label="KAYDKU DHAMMAADAY" value={productAccess.data ? outOfStock?.count ?? 0 : "—"} note="Alaab aan kayd ku jirin" glyph="!" tone="warning" href={productAccess.data ? `${base}/products` : undefined} />}
            {canShowCustomerCount && <MetricCard label="MACAAMIISHA" value={customerAccess.data ? customers?.count ?? 0 : "—"} note="Diiwaanka macaamiisha" glyph="♙" href={customerAccess.data ? `${base}/customers` : undefined} />}
            {canShowBranchCount && <MetricCard label="LAAMAHA FIRFIRCOON" value={branchAccess.data ? branches?.count ?? 0 : "—"} note="Laamaha shaqaynaya" glyph="⌂" href={branchAccess.data ? `${base}/branches` : undefined} />}
          </section>

          <div className="business-dashboard-columns">
            {canShowRecentSales && <section className="panel business-dashboard-panel">
              <div className="business-section-heading">
                <div><span className="section-kicker">DHAQDHAQAAQA</span><h2>Iibkii ugu dambeeyay</h2></div>
                {salesAccess.data && <Link href={`${base}/sales`}>Dhammaan iibka <span aria-hidden="true">→</span></Link>}
              </div>
              {!salesAccess.data ? (
                <p className="business-empty-note">Doorkaagu ma oggola inaad aragto iibka.</p>
              ) : (sales?.data?.length ?? 0) === 0 ? (
                <div className="business-empty-state"><span className="business-empty-icon">↗</span><strong>Iib wali lama diiwaangelin.</strong><span>Marka iib la sameeyo, dhaqdhaqaaqyadu halkan ayay ka muuqan doonaan.</span></div>
              ) : (
                <div className="business-recent-list">
                  {(sales?.data ?? []).map((sale) => (
                    <div className="business-recent-row" key={sale.id}>
                      <span className="business-recent-icon">↗</span>
                      <span className="business-recent-main"><strong>{sale.invoice_number || "Iib"}</strong><small>{formatDate(sale.sold_at)}</small></span>
                      <span className={`business-sale-status business-sale-${sale.status}`}>{sale.status.replaceAll("_", " ")}</span>
                      <strong className="business-sale-total">{formatAmount(sale.total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>}

            <section className="panel business-dashboard-panel business-shortcuts-panel">
              <div className="business-section-heading">
                <div><span className="section-kicker">SI DEGDEG AH</span><h2>Hawlaha ganacsiga</h2></div>
              </div>
              <div className="business-shortcut-list">
                {shortcuts.map((shortcut) => (
                  <Link className="business-shortcut" href={shortcut.href} key={shortcut.href}>
                    <span className="business-shortcut-icon">{shortcut.glyph}</span>
                    <span><strong>{shortcut.label}</strong><small>{shortcut.detail}</small></span>
                    <span className="business-shortcut-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
                {shortcuts.length === 0 && <p className="business-empty-note">Doorkaagu ma laha rukhsad uu ku furo qaybahan.</p>}
              </div>
            </section>
          </div>
          <p className="business-data-note"><span aria-hidden="true">✓</span> Tirakoobyadu waxay ka yimaadaan xogta dhabta ah ee business-kan; xogta business-yada kale ma muuqato.</p>
        </>
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
  note,
  glyph,
  href,
  tone,
}: {
  label: string;
  value: number | string;
  note: string;
  glyph: string;
  href?: string;
  tone?: "warning";
}) {
  const content = (
    <>
      <span className={`business-metric-icon${tone ? ` business-metric-${tone}` : ""}`} aria-hidden="true">{glyph}</span>
      <span className="business-metric-label">{label}</span>
      <strong className="business-metric-value">{value}</strong>
      <span className="business-metric-note">{note}</span>
    </>
  );

  return href
    ? <Link className="business-metric-card" href={href}>{content}</Link>
    : <div className="business-metric-card">{content}</div>;
}

function formatAmount(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("so-SO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function DashboardLoading() {
  return (
    <div className="business-content" aria-busy="true">
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">BUSINESS WORKSPACE</div>
          <h1>Dashboard-ka waa la furayaa.</h1>
        </div>
      </div>
    </div>
  );
}


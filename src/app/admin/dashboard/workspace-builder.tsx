"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Tier = "4-star" | "5-star";
type WorkspaceConfig = {
  theme: {
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
  };
  layout: "standard" | "compact";
  sidebar: "classic" | "soft";
  dashboardWidgets: string[];
  hiddenModules: string[];
};
type Plan = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string;
  trial_days: number;
  max_users: number;
  max_branches: number;
  modules: string[];
  status: string;
  workspace_tier: Tier | null;
  workspace_config: WorkspaceConfig | null;
  published_workspace_config: WorkspaceConfig | null;
  workspace_config_version: number;
};
type Assignment = {
  id: string;
  business_id: string;
  plan_id: string;
  status: string;
  renews_at: string | null;
  businesses: { name: string } | { name: string }[];
};
type Version = {
  id: string;
  plan_id: string;
  tier: Tier;
  version: number;
  config: WorkspaceConfig;
  created_at: string;
};
type BuilderData = { plans: Plan[]; assignments: Assignment[]; versions: Version[] };

async function fetchBuilderData(): Promise<BuilderData> {
  const response = await fetch("/api/admin/workspace-builder", { cache: "no-store" });
  const result = await response.json() as BuilderData & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Xogta Workspace Builder lama soo rari karin.");
  return result;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  theme: {
    primaryColor: "#2f67c7",
    accentColor: "#22a06b",
    backgroundColor: "#f4f7fb",
  },
  layout: "standard",
  sidebar: "classic",
  dashboardWidgets: ["products", "out_of_stock", "customers", "branches", "recent_sales"],
  hiddenModules: [],
};

const modules = [
  ["products", "Products"],
  ["sales", "Sales"],
  ["invoices", "Invoices"],
  ["customers", "Customers"],
  ["suppliers", "Suppliers"],
  ["branches", "Branches"],
  ["team", "Team"],
  ["reports", "Reports"],
  ["settings", "Settings"],
] as const;
const widgets = [
  ["products", "Alaabta"],
  ["out_of_stock", "Kayd dhammaaday"],
  ["customers", "Macaamiisha"],
  ["branches", "Laamaha"],
  ["recent_sales", "Iibkii ugu dambeeyay"],
] as const;

function normalizeConfig(value: unknown): WorkspaceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_CONFIG;
  const config = value as Partial<WorkspaceConfig>;
  const theme = config.theme;
  if (
    !theme
    || !/^#[0-9a-f]{6}$/i.test(theme.primaryColor)
    || !/^#[0-9a-f]{6}$/i.test(theme.accentColor)
    || !/^#[0-9a-f]{6}$/i.test(theme.backgroundColor)
  ) return DEFAULT_CONFIG;
  return {
    theme: {
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
      backgroundColor: theme.backgroundColor,
    },
    layout: config.layout === "compact" ? "compact" : "standard",
    sidebar: config.sidebar === "soft" ? "soft" : "classic",
    dashboardWidgets: Array.isArray(config.dashboardWidgets)
      ? config.dashboardWidgets.filter((item): item is string => typeof item === "string" && widgets.some(([key]) => key === item))
      : [...DEFAULT_CONFIG.dashboardWidgets],
    hiddenModules: Array.isArray(config.hiddenModules)
      ? config.hiddenModules.filter((item): item is string => typeof item === "string" && modules.some(([key]) => key === item))
      : [],
  };
}

function businessName(assignment: Assignment) {
  return Array.isArray(assignment.businesses)
    ? assignment.businesses[0]?.name ?? "Ganacsi"
    : assignment.businesses?.name ?? "Ganacsi";
}

export default function WorkspaceBuilderView() {
  const [data, setData] = useState<BuilderData | null>(null);
  const [tier, setTier] = useState<Tier>("4-star");
  const [planId, setPlanId] = useState("");
  const [config, setConfig] = useState<WorkspaceConfig>(DEFAULT_CONFIG);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setError("");
    try {
      const result = await fetchBuilderData();
      setData(result);
      const selectedPlan = result.plans.find((plan) => plan.id === planId && plan.status.toLowerCase() === "active")
        ?? result.plans.find((plan) => plan.workspace_tier === tier && plan.status.toLowerCase() === "active");
      if (selectedPlan) {
        setPlanId(selectedPlan.id);
        setConfig(normalizeConfig(selectedPlan.workspace_config));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Xogta lama soo rari karin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchBuilderData()
      .then((result) => {
        if (!active) return;
        setData(result);
        const selectedPlan = result.plans.find((plan) => plan.workspace_tier === "4-star" && plan.status.toLowerCase() === "active");
        if (selectedPlan) {
          setPlanId(selectedPlan.id);
          setConfig(normalizeConfig(selectedPlan.workspace_config));
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Xogta lama soo rari karin.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const activePlans = useMemo(() => (data?.plans ?? []).filter((plan) => plan.status.toLowerCase() === "active"), [data]);
  const selectedPlan = activePlans.find((plan) => plan.id === planId);
  const assignments = (data?.assignments ?? []).filter((item) => item.plan_id === selectedPlan?.id);
  const versions = (data?.versions ?? []).filter((item) => item.plan_id === selectedPlan?.id);

  function changeTier(nextTier: Tier) {
    setTier(nextTier);
    const plan = activePlans.find((item) => item.workspace_tier === nextTier);
    setPlanId(plan?.id ?? "");
    setConfig(normalizeConfig(plan?.workspace_config));
    setNotice("");
  }

  function changePlan(nextPlanId: string) {
    const plan = activePlans.find((item) => item.id === nextPlanId);
    setPlanId(nextPlanId);
    setConfig(normalizeConfig(plan?.workspace_config));
    setNotice("");
  }

  function patchConfig(patch: Partial<WorkspaceConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  async function save(action: "draft" | "publish") {
    if (!selectedPlan) {
      setError("Marka hore dooro Subscription plan Active ah.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/workspace-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, planId: selectedPlan.id, tier, config }),
      });
      const result = await response.json() as { error?: string; version?: number; warning?: string };
      if (!response.ok) throw new Error(result.error ?? "Workspace configuration lama kaydin.");
      const message = action === "publish"
        ? `Configuration-ka waa la daabacay (version ${result.version}).`
        : "Draft-ka waa la kaydiyey.";
      setNotice(result.warning ? `${message} ${result.warning}` : message);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Workspace configuration lama kaydin.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(versionId: string, restoredTier: Tier) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/workspace-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", versionId }),
      });
      const result = await response.json() as { error?: string; version?: number; warning?: string };
      if (!response.ok) throw new Error(result.error ?? "Version-ka lama soo celin.");
      setTier(restoredTier);
      setNotice(result.warning ?? `Version-kii waa la soo celiyey; version cusub ${result.version} ayaa la daabacay.`);
      await loadData();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Version-ka lama soo celin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">SUPER ADMIN · BUSINESS WORKSPACE</div>
          <h1>Star Plans &amp; Workspace Builder</h1>
          <p>Maamul 4-Star iyo 5-Star gudaha hal Business Workspace ah. Qiimaha iyo muddada waxay ka yimaadaan plans-ka jira.</p>
        </div>
        <Link className="button button-dark" href="/admin/plans">Maamul qiimaha iyo xaddidaadaha</Link>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="workspace-notice" role="status">{notice}</p>}

      {loading ? (
        <section className="panel workspace-module-panel"><p>Workspace Builder waa la soo rarayaa.</p></section>
      ) : !data ? (
        <section className="panel workspace-module-panel"><p>Xogta Builder-ka lama heli karo.</p></section>
      ) : activePlans.length === 0 ? (
        <section className="panel workspace-module-panel">
          <h2>Subscription plan Active ah ma jiro</h2>
          <p>Samee plan-ka gudaha maamulka plans-ka, qiimaha adiga ayaa dejinaya.</p>
          <Link className="button button-dark" href="/admin/plans">Plan samee</Link>
        </section>
      ) : (
        <div className="workspace-builder-grid">
          <section className="panel workspace-module-panel">
            <div className="section-heading">
              <div><span className="section-kicker">PLAN IYO CONFIGURATION</span><h2>Dejinta tier-ka</h2></div>
            </div>
            <div className="workspace-module-form">
              <label className="workspace-module-field">
                <span>Star tier</span>
                <select className="workspace-select" onChange={(event) => changeTier(event.target.value as Tier)} value={tier}>
                  <option value="4-star">4-Star</option>
                  <option value="5-star">5-Star</option>
                </select>
              </label>
              <label className="workspace-module-field">
                <span>Subscription plan</span>
                <select className="workspace-select" onChange={(event) => changePlan(event.target.value)} value={planId}>
                  <option value="">Plan dooro</option>
                  {activePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name} · {plan.currency} {plan.price} / {plan.interval}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedPlan && (
              <>
                <div className="workspace-builder-plan-summary">
                  <strong>{selectedPlan.name}</strong>
                  <span>{selectedPlan.currency} {selectedPlan.price} · {selectedPlan.interval} · {selectedPlan.max_users} users · {selectedPlan.max_branches} branches</span>
                  <small>Plan-kan jiraa waa la isticmaalayaa; xogta business-ka lama beddelayo.</small>
                </div>

                <div className="workspace-builder-controls">
                  <h3>Muuqaalka workspace-ka</h3>
                  <div className="workspace-builder-color-row">
                    <label>Primary <input type="color" value={config.theme.primaryColor} onChange={(event) => patchConfig({ theme: { ...config.theme, primaryColor: event.target.value } })} /></label>
                    <label>Accent <input type="color" value={config.theme.accentColor} onChange={(event) => patchConfig({ theme: { ...config.theme, accentColor: event.target.value } })} /></label>
                    <label>Background <input type="color" value={config.theme.backgroundColor} onChange={(event) => patchConfig({ theme: { ...config.theme, backgroundColor: event.target.value } })} /></label>
                  </div>
                  <div className="workspace-module-form">
                    <label className="workspace-module-field"><span>Dashboard layout</span><select className="workspace-select" value={config.layout} onChange={(event) => patchConfig({ layout: event.target.value as WorkspaceConfig["layout"] })}><option value="standard">Standard</option><option value="compact">Compact</option></select></label>
                    <label className="workspace-module-field"><span>Sidebar style</span><select className="workspace-select" value={config.sidebar} onChange={(event) => patchConfig({ sidebar: event.target.value as WorkspaceConfig["sidebar"] })}><option value="classic">Classic</option><option value="soft">Soft</option></select></label>
                  </div>
                  <h3>Dashboard widgets</h3>
                  <div className="workspace-builder-checks">
                    {widgets.map(([key, label]) => (
                      <label key={key}><input checked={config.dashboardWidgets.includes(key)} onChange={(event) => patchConfig({
                        dashboardWidgets: event.target.checked
                          ? [...config.dashboardWidgets, key]
                          : config.dashboardWidgets.filter((widget) => widget !== key),
                      })} type="checkbox" />{label}</label>
                    ))}
                  </div>
                  <h3>Qaybaha la qarinayo ee workspace-kan</h3>
                  <div className="workspace-builder-checks">
                    {modules.map(([key, label]) => (
                      <label key={key}><input checked={config.hiddenModules.includes(key)} onChange={(event) => patchConfig({
                        hiddenModules: event.target.checked
                          ? [...config.hiddenModules, key]
                          : config.hiddenModules.filter((module) => module !== key),
                      })} type="checkbox" />{label}</label>
                    ))}
                  </div>
                  <div className="workspace-builder-actions">
                    <button className="button button-light" disabled={busy} onClick={() => void save("draft")} type="button">Draft kaydi</button>
                    <button className="button button-dark" disabled={busy} onClick={() => void save("publish")} type="button">Publish configuration</button>
                  </div>
                </div>
              </>
            )}
          </section>

          <div className="workspace-builder-side">
            <section className="panel workspace-module-panel">
              <div className="section-heading"><div><span className="section-kicker">LIVE PREVIEW</span><h2>{tier === "4-star" ? "4-Star" : "5-Star"} workspace</h2></div></div>
              <div className="workspace-builder-preview-switch">
                <button className={previewMode === "desktop" ? "active" : ""} onClick={() => setPreviewMode("desktop")} type="button">Desktop</button>
                <button className={previewMode === "mobile" ? "active" : ""} onClick={() => setPreviewMode("mobile")} type="button">Mobile</button>
              </div>
              <div
                className={`workspace-builder-preview workspace-builder-preview-${previewMode}`}
                style={{ backgroundColor: config.theme.backgroundColor, borderTopColor: config.theme.primaryColor }}
              >
                <div className="workspace-builder-preview-sidebar" style={{ backgroundColor: config.theme.primaryColor }}>
                  <strong>VELTO · {tier.toUpperCase()}</strong>
                  {modules.filter(([key]) => !config.hiddenModules.includes(key)).slice(0, 5).map(([, label]) => <span key={label}>{label}</span>)}
                </div>
                <div className="workspace-builder-preview-content">
                  <b style={{ color: config.theme.primaryColor }}>Ganacsigaaga. Hal meel.</b>
                  <div className="workspace-builder-preview-cards">
                    {widgets.filter(([key]) => config.dashboardWidgets.includes(key)).slice(0, 3).map(([, label]) => (
                      <span key={label} style={{ borderColor: config.theme.accentColor }}>{label}</span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="form-hint">Preview-kan wuxuu muujinayaa qaabka iyo midabbada; ma aha dashboard labaad.</p>
            </section>

            <section className="panel workspace-module-panel">
              <div className="section-heading"><div><span className="section-kicker">BUSINESSES</span><h2>{assignments.length} loo qoondeeyey</h2></div></div>
              {assignments.length ? (
                <ul className="workspace-builder-assignment-list">
                  {assignments.map((assignment) => <li key={assignment.id}><strong>{businessName(assignment)}</strong><span>{assignment.status} · renews {assignment.renews_at ? new Date(assignment.renews_at).toISOString().slice(0, 10) : "—"}</span></li>)}
                </ul>
              ) : <p className="form-hint">Ganacsi plan-kan ku jira wali ma jiro.</p>}
            </section>

            <section className="panel workspace-module-panel">
              <div className="section-heading"><div><span className="section-kicker">PUBLISHED VERSIONS</span><h2>Taariikhda config-ka</h2></div></div>
              {versions.length ? (
                <ul className="workspace-builder-assignment-list">
                  {versions.map((version) => (
                    <li key={version.id}>
                      <strong>{version.tier.toUpperCase()} · v{version.version}</strong>
                      <span>{new Date(version.created_at).toISOString().slice(0, 10)}</span>
                      <button className="action-button" disabled={busy} onClick={() => void restore(version.id, version.tier)} type="button">Soo celi</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="form-hint">Version la publish-gareeyey wali ma jiro.</p>}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceTier = "4-star" | "5-star";

export type BusinessWorkspaceConfig = {
  tier: WorkspaceTier | null;
  modules: string[] | null;
  configuration: {
    theme?: {
      primaryColor?: string;
      accentColor?: string;
      backgroundColor?: string;
    };
    layout?: "standard" | "compact";
    sidebar?: "classic" | "soft";
    dashboardWidgets?: string[];
    hiddenModules?: string[];
  };
  version: number;
};

const moduleAliases: Record<string, string[]> = {
  products: ["products", "inventory"],
  sales: ["sales"],
  invoices: ["invoices"],
  customers: ["customers"],
  suppliers: ["suppliers"],
  branches: ["branches"],
  team: ["team", "employees"],
  reports: ["reports"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function parseBusinessWorkspaceConfig(value: unknown): BusinessWorkspaceConfig | null {
  if (!isRecord(value)) return null;
  const tier = value.tier === "4-star" || value.tier === "5-star" ? value.tier : null;
  const modules = Array.isArray(value.modules)
    ? value.modules.filter((item): item is string => typeof item === "string")
    : null;
  const rawConfiguration = isRecord(value.configuration) ? value.configuration : {};
  const rawTheme = isRecord(rawConfiguration.theme) ? rawConfiguration.theme : {};
  const theme = {
    ...(validColor(rawTheme.primaryColor) ? { primaryColor: rawTheme.primaryColor } : {}),
    ...(validColor(rawTheme.accentColor) ? { accentColor: rawTheme.accentColor } : {}),
    ...(validColor(rawTheme.backgroundColor) ? { backgroundColor: rawTheme.backgroundColor } : {}),
  };
  const configuration: BusinessWorkspaceConfig["configuration"] = {
    ...(Object.keys(theme).length ? { theme } : {}),
    ...(rawConfiguration.layout === "standard" || rawConfiguration.layout === "compact" ? { layout: rawConfiguration.layout } : {}),
    ...(rawConfiguration.sidebar === "classic" || rawConfiguration.sidebar === "soft" ? { sidebar: rawConfiguration.sidebar } : {}),
    ...(Array.isArray(rawConfiguration.dashboardWidgets)
      ? { dashboardWidgets: rawConfiguration.dashboardWidgets.filter((item): item is string => typeof item === "string") }
      : {}),
    ...(Array.isArray(rawConfiguration.hiddenModules)
      ? { hiddenModules: rawConfiguration.hiddenModules.filter((item): item is string => typeof item === "string") }
      : {}),
  };

  return {
    tier,
    modules,
    configuration,
    version: typeof value.version === "number" && Number.isInteger(value.version) && value.version >= 0 ? value.version : 0,
  };
}

export function workspaceAllowsModule(config: BusinessWorkspaceConfig | null, moduleId: string) {
  if (!config) return true;
  if (config.configuration.hiddenModules?.includes(moduleId)) return false;
  if (moduleId === "dashboard" || moduleId === "settings") return true;
  if (!config.tier || !config.modules) return true;

  const aliases = moduleAliases[moduleId] ?? [moduleId];
  const enabledModules = new Set(config.modules.map((module) => module.trim().toLowerCase()));
  return aliases.some((alias) => enabledModules.has(alias));
}

export function isMissingWorkspaceConfigFunction(error: { code?: string; message?: string }) {
  return error.code === "PGRST202"
    || error.code === "42883"
    || (error.message ?? "").toLowerCase().includes("get_business_workspace_config");
}

export async function loadBusinessWorkspaceConfig(supabase: SupabaseClient, businessId: string) {
  const { data, error } = await supabase.rpc("get_business_workspace_config", {
    target_business_id: businessId,
  });
  if (error) {
    if (isMissingWorkspaceConfigFunction(error)) {
      console.warn("Workspace configuration migration is not applied; using the existing workspace behavior.");
      return { config: null, error: null };
    }
    console.error("Could not load business workspace configuration:", error.message);
    return { config: null, error };
  }
  const config = parseBusinessWorkspaceConfig(data);
  if (!config) {
    const invalidConfigError = new Error("The business workspace configuration response is invalid.");
    console.error(invalidConfigError.message);
    return { config: null, error: invalidConfigError };
  }
  return { config, error: null };
}

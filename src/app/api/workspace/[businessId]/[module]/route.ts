import { NextResponse, type NextRequest } from "next/server";
import { requireBusinessMember } from "@/lib/auth/authorization";
import { loadBusinessWorkspaceConfig, workspaceAllowsModule } from "@/lib/workspace/config";

type ModuleId = "products" | "customers" | "suppliers" | "branches" | "sales" | "invoices" | "reports" | "settings";
type ModuleConfig = { resource: string; table?: "products" | "customers" | "suppliers" | "branches" };

const modules: Record<ModuleId, ModuleConfig> = {
  products: { resource: "products", table: "products" },
  customers: { resource: "customers", table: "customers" },
  suppliers: { resource: "suppliers", table: "suppliers" },
  branches: { resource: "branches", table: "branches" },
  sales: { resource: "sales" },
  invoices: { resource: "invoices" },
  reports: { resource: "reports" },
  settings: { resource: "settings" },
};

function isModuleId(value: string): value is ModuleId {
  return Object.hasOwn(modules, value);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function redirectToModule(request: NextRequest, businessId: string, moduleId: ModuleId, notice: string) {
  const target = new URL(`/app/workspace/${businessId}/${moduleId}`, request.url);
  target.searchParams.set("notice", notice);
  return NextResponse.redirect(target, { status: 303 });
}

function logDatabaseError(
  action: string,
  error: { code?: string; message: string; details?: string | null; hint?: string | null },
) {
  console.error(`${action}: ${JSON.stringify({
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })}`);
  return error.code ? `failed-${error.code}` : "failed";
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validText(value: string, maxLength: number, required = false) {
  return value.length <= maxLength && (!required || value.length > 0);
}

function validNumber(value: string, minimum: number, decimals: number) {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) return null;
  const fraction = value.split(".")[1] ?? "";
  if (fraction.length > decimals) return null;
  return parsed;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string; module: string }> },
) {
  const { businessId, module: moduleParam } = await params;
  if (!isModuleId(moduleParam)) return NextResponse.json({ error: "Unknown workspace module." }, { status: 404 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const { business, supabase } = await requireBusinessMember(businessId);
  const { config: workspaceConfig, error: workspaceConfigError } = await loadBusinessWorkspaceConfig(supabase, business.id);
  if (workspaceConfigError) {
    return NextResponse.json({ error: "Workspace configuration could not be verified." }, { status: 503 });
  }
  if (!workspaceAllowsModule(workspaceConfig, moduleParam)) {
    return redirectToModule(request, business.id, moduleParam, "forbidden");
  }
  const formData = await request.formData();
  const deleting = field(formData, "_action") === "delete";
  const updating = field(formData, "_action") === "update";
  if (["invoices", "reports"].includes(moduleParam) || (moduleParam === "sales" && deleting)) {
    return redirectToModule(request, business.id, moduleParam, "forbidden");
  }
  const action = deleting ? "delete" : updating ? "edit" : moduleParam === "settings" ? "edit" : "create";
  const { data: permitted, error: permissionError } = await supabase.rpc("has_business_permission", {
    target_business_id: business.id,
    target_resource: modules[moduleParam].resource,
    target_action: action,
  });

  if (permissionError) {
    console.error("Could not verify workspace module permission:", permissionError.message);
    return redirectToModule(request, business.id, moduleParam, "failed");
  }
  if (!permitted) return redirectToModule(request, business.id, moduleParam, "forbidden");

  if (deleting) {
    const table = modules[moduleParam].table;
    if (!table) return redirectToModule(request, business.id, moduleParam, "forbidden");
    const id = field(formData, "id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return redirectToModule(request, business.id, moduleParam, "invalid");
    const { error } = await supabase.from(table)
      .delete().eq("id", id).eq("business_id", business.id);
    if (error) {
      return redirectToModule(request, business.id, moduleParam, logDatabaseError("Workspace record deletion failed", error));
    }
    return redirectToModule(request, business.id, moduleParam, "deleted");
  }

  if (moduleParam === "settings") {
    const currency = field(formData, "currency").toUpperCase();
    const timezone = field(formData, "timezone");
    if (!/^[A-Z]{3}$/.test(currency) || !validText(timezone, 80, true)) {
      return redirectToModule(request, business.id, moduleParam, "invalid");
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return redirectToModule(request, business.id, moduleParam, "invalid");
    }
    const { data: updatedSettings, error } = await supabase.from("business_settings")
      .update({ currency, timezone, updated_at: new Date().toISOString() })
      .eq("business_id", business.id)
      .select("business_id")
      .maybeSingle();
    if (error || !updatedSettings) {
      if (error) {
        return redirectToModule(request, business.id, moduleParam, logDatabaseError("Business settings update failed", error));
      }
      console.error("Business settings update failed: no settings row matched this business.");
      return redirectToModule(request, business.id, moduleParam, "failed");
    }
    return redirectToModule(request, business.id, moduleParam, "saved");
  }

  if (moduleParam === "reports") return redirectToModule(request, business.id, moduleParam, "forbidden");
  if (updating && moduleParam !== "products") {
    return redirectToModule(request, business.id, moduleParam, "forbidden");
  }

  if (moduleParam === "sales") {
    const productId = field(formData, "product_id");
    const quantity = validNumber(field(formData, "quantity"), 0.001, 3);
    const customerId = field(formData, "customer_id");
    if (!/^[0-9a-f-]{36}$/i.test(productId)
      || (customerId && !/^[0-9a-f-]{36}$/i.test(customerId))
      || quantity === null) {
      return redirectToModule(request, business.id, moduleParam, "invalid");
    }
    const { data: product, error: productError } = await supabase.from("products")
      .select("id,quantity,status")
      .eq("id", productId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (productError) {
      return redirectToModule(request, business.id, moduleParam, logDatabaseError("Workspace sale product lookup failed", productError));
    }
    if (!product || product.status !== "active") {
      return redirectToModule(request, business.id, moduleParam, "invalid");
    }
    if (quantity > Number(product.quantity)) {
      return redirectToModule(request, business.id, moduleParam, "failed-stock");
    }
    const { error } = await supabase.rpc("create_business_sale", {
      target_business_id: business.id,
      target_product_id: productId,
      target_quantity: quantity,
      target_customer_id: customerId || null,
    });
    if (error) {
      return redirectToModule(request, business.id, moduleParam, logDatabaseError("Workspace sale creation failed", error));
    }
    return redirectToModule(request, business.id, moduleParam, "saved");
  }

  const name = field(formData, "name");
  const email = field(formData, "email");
  const phone = field(formData, "phone");
  const address = field(formData, "address");
  if (!validText(name, 160, true) || !validText(email, 254) || !validText(phone, 40) || !validText(address, 300)) {
    return redirectToModule(request, business.id, moduleParam, "invalid");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirectToModule(request, business.id, moduleParam, "invalid");
  }

  let payload: Record<string, string | number | null>;
  if (moduleParam === "products") {
    const description = field(formData, "description");
    const barcode = field(formData, "barcode");
    const sku = field(formData, "sku");
    const category = field(formData, "category");
    const branchId = field(formData, "branch_id");
    const status = updating ? field(formData, "status").toLowerCase() : "active";
    const quantity = validNumber(field(formData, "quantity"), 0, 3);
    const costPrice = validNumber(field(formData, "cost_price"), 0, 2);
    const sellingPrice = validNumber(field(formData, "selling_price"), 0, 2);
    if (!validText(description, 2000) || !validText(barcode, 120)
      || !validText(sku, 80) || !validText(category, 120)
      || !["active", "archived"].includes(status)
      || (branchId && !/^[0-9a-f-]{36}$/i.test(branchId))
      || quantity === null || costPrice === null || sellingPrice === null) {
      return redirectToModule(request, business.id, moduleParam, "invalid");
    }
    payload = {
      business_id: business.id,
      name,
      description,
      barcode: barcode || null,
      sku,
      category,
      ...(!updating || formData.has("branch_id") ? { branch_id: branchId || null } : {}),
      quantity,
      cost_price: costPrice,
      selling_price: sellingPrice,
      status,
      updated_at: new Date().toISOString(),
    };
  } else if (moduleParam === "branches") {
    payload = { business_id: business.id, name, phone, address, status: "active" };
  } else {
    payload = { business_id: business.id, name, email, phone, address };
  }

  const table = modules[moduleParam].table;
  if (!table) return redirectToModule(request, business.id, moduleParam, "forbidden");
  if (updating) {
    const id = field(formData, "id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return redirectToModule(request, business.id, moduleParam, "invalid");
    const { data, error } = await supabase.from("products")
      .update(payload).eq("id", id).eq("business_id", business.id).select("id").maybeSingle();
    if (error) {
      return redirectToModule(request, business.id, moduleParam, logDatabaseError("Workspace product update failed", error));
    }
    if (!data) return redirectToModule(request, business.id, moduleParam, "failed");
    return redirectToModule(request, business.id, moduleParam, "saved");
  }
  const { error } = await supabase.from(table).insert(payload);
  if (error) {
    return redirectToModule(request, business.id, moduleParam, logDatabaseError("Workspace record creation failed", error));
  }
  return redirectToModule(request, business.id, moduleParam, "saved");
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireBusinessMember } from "@/lib/auth/authorization";
import { loadBusinessWorkspaceConfig, workspaceAllowsModule } from "@/lib/workspace/config";
import ProductImageManager, { type ProductImageView } from "./product-image-manager";
import SaleForm from "./sale-form";

export const instant = true;

type ModuleId = "products" | "customers" | "suppliers" | "branches" | "sales" | "invoices" | "reports" | "settings";
type RecordRow = Record<string, unknown>;
type ProductChoice = { id: string; name: string; sku: string; quantity: number; selling_price: number };
type CustomerChoice = { id: string; name: string };
type BusinessSettings = { currency: string; timezone: string };
type ProductSalesSummary = {
  product_id: string;
  units_sold: number | string;
  revenue: number | string;
  last_sold_at: string | null;
};

type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "number" | "textarea";
  required?: boolean;
  step?: string;
  min?: string;
};

type Column = { name: string; label: string };

const modules: Record<ModuleId, {
  title: string;
  description: string;
  resource: string;
  fields: Field[];
  columns: Column[];
}> = {
  products: {
    title: "Products & inventory",
    description: "Maamul alaabta, SKU-ga, tirada kaydka iyo qiimaha.",
    resource: "products",
    fields: [
      { name: "name", label: "Magaca alaabta", type: "text", required: true },
      { name: "description", label: "Sharaxaadda", type: "textarea" },
      { name: "barcode", label: "Barcode", type: "text" },
      { name: "sku", label: "SKU", type: "text" },
      { name: "category", label: "Qaybta", type: "text" },
      { name: "quantity", label: "Tirada kaydka", type: "number", min: "0", step: "0.001", required: true },
      { name: "cost_price", label: "Qiimaha iibka lagaga soo iibsaday", type: "number", min: "0", step: "0.01", required: true },
      { name: "selling_price", label: "Qiimaha macaamilka", type: "number", min: "0", step: "0.01", required: true },
    ],
    columns: [
      { name: "name", label: "Product" },
      { name: "sku", label: "SKU" },
      { name: "barcode", label: "Barcode" },
      { name: "category", label: "Category" },
      { name: "quantity", label: "Stock" },
      { name: "cost_price", label: "Cost" },
      { name: "selling_price", label: "Price" },
      { name: "status", label: "Status" },
    ],
  },
  customers: {
    title: "Customers",
    description: "Xogta macaamiisha ganacsigan oo keliya.",
    resource: "customers",
    fields: [
      { name: "name", label: "Magaca macaamilka", type: "text", required: true },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Telefoon", type: "tel" },
      { name: "address", label: "Cinwaan", type: "text" },
    ],
    columns: [
      { name: "name", label: "Customer" },
      { name: "email", label: "Email" },
      { name: "phone", label: "Phone" },
      { name: "address", label: "Address" },
    ],
  },
  suppliers: {
    title: "Suppliers",
    description: "Maamul xiriirrada alaab-qeybiyeyaasha ganacsigan.",
    resource: "suppliers",
    fields: [
      { name: "name", label: "Magaca supplier-ka", type: "text", required: true },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Telefoon", type: "tel" },
      { name: "address", label: "Cinwaan", type: "text" },
    ],
    columns: [
      { name: "name", label: "Supplier" },
      { name: "email", label: "Email" },
      { name: "phone", label: "Phone" },
      { name: "address", label: "Address" },
    ],
  },
  branches: {
    title: "Branches",
    description: "Maamul laamaha ganacsigan; Super Admin-ku ma arko faahfaahinta laamaha.",
    resource: "branches",
    fields: [
      { name: "name", label: "Magaca laanta", type: "text", required: true },
      { name: "phone", label: "Telefoon", type: "tel" },
      { name: "address", label: "Cinwaan", type: "text" },
    ],
    columns: [
      { name: "name", label: "Branch" },
      { name: "phone", label: "Phone" },
      { name: "address", label: "Address" },
      { name: "status", label: "Status" },
    ],
  },
  sales: {
    title: "Sales",
    description: "Samee iib; kaydka alaabta iyo invoice-ku si atomic ah ayay u cusboonaanayaan.",
    resource: "sales",
    fields: [],
    columns: [
      { name: "invoice_number", label: "Invoice" },
      { name: "total", label: "Total" },
      { name: "status", label: "Status" },
      { name: "sold_at", label: "Date" },
    ],
  },
  invoices: {
    title: "Invoices",
    description: "La soco qaansheegadaha laga sameeyey iibka ganacsigan.",
    resource: "invoices",
    fields: [],
    columns: [
      { name: "invoice_number", label: "Invoice" },
      { name: "status", label: "Status" },
      { name: "subtotal", label: "Subtotal" },
      { name: "tax", label: "Tax" },
      { name: "total", label: "Total" },
      { name: "issued_at", label: "Issued" },
      { name: "due_at", label: "Due" },
    ],
  },
  reports: {
    title: "Reports",
    description: "Guudmar iibka iyo qiimaha iibka ee workspace-kan.",
    resource: "reports",
    fields: [],
    columns: [
      { name: "invoice_number", label: "Invoice" },
      { name: "total", label: "Total" },
      { name: "status", label: "Status" },
      { name: "sold_at", label: "Date" },
    ],
  },
  settings: {
    title: "Business settings",
    description: "Deji lacagta iyo timezone-ka ganacsigan.",
    resource: "settings",
    fields: [],
    columns: [],
  },
};

function isModuleId(value: string): value is ModuleId {
  return Object.hasOwn(modules, value);
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function productSalesStatus(summary: ProductSalesSummary | undefined, quantity: unknown) {
  const sold = Number(summary?.units_sold ?? 0);
  if (sold <= 0) return "Never sold";
  return Number(quantity) > 0 ? "Partially sold" : "Fully sold";
}

function formatProductDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(0, 10);
}

function noticeText(value: string | undefined) {
  if (value === "saved") return "Xogta waa la kaydiyey.";
  if (value === "deleted") return "Diiwaanka waa la saaray.";
  if (value === "forbidden") return "Doorkaagu uma oggola ficilkan.";
  if (value === "failed") return "Kaydintu ma guulaysan. Hubi migration-ka iyo RLS-ka kadibna isku day mar kale.";
  if (value === "failed-23505") return "SKU-ga ama xog kale oo gaar ah hore ayaa ganacsigan loogu isticmaalay. Geli SKU kale ama ka tag SKU-ga madhan.";
  if (value === "failed-42501") return "Database-ku wuu diiday kaydinta (RLS). Hubi policy-ga iyo rukhsadda doorkaaga ee module-kan.";
  if (value === "failed-23502") return "Xog muhiim ah ayaa ka maqan diiwaanka. Buuxi dhammaan meelaha khasabka ah.";
  if (value === "failed-23514") return "Qaar ka mid ah xogta ma waafaqsana shuruudaha database-ka. Hubi qiimaha iyo qaabka xogta.";
  if (value === "failed-42703" || value === "failed-PGRST204") return "Schema-ga Supabase wuu ka duwan yahay app-ka. Codso in migration-ka database-ka la dabaqo.";
  if (value === "failed-PGRST202" || value === "failed-42883") return "Hawlgalka iibka ee Supabase lama helin. Maamulaha database-ku ha dabaqo migration-ka RPC-ga create_business_sale.";
  if (value === "failed-stock") return "Kaydka alaabta kuma filna tirada iibka. Hubi kaydka kadibna isku day mar kale.";
  if (value === "invalid") return "Fadlan hubi xogta aad gelisay.";
  return "";
}

export default function BusinessModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; module: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <Suspense fallback={<ModuleLoading />}>
      <BusinessModuleContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BusinessModuleContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; module: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await connection();
  const { businessId, module: moduleParam } = await params;
  if (!isModuleId(moduleParam)) notFound();

  const moduleInfo = modules[moduleParam];
  const { business, supabase } = await requireBusinessMember(businessId);
  const { config: workspaceConfig, error: workspaceConfigError } = await loadBusinessWorkspaceConfig(supabase, business.id);
  if (workspaceConfigError) return <ModuleError title={moduleInfo.title} message={workspaceConfigError.message} />;
  if (!workspaceAllowsModule(workspaceConfig, moduleParam)) notFound();
  const [viewPermission, createPermission, deletePermission, editPermission] = await Promise.all([
    supabase.rpc("has_business_permission", {
      target_business_id: business.id,
      target_resource: moduleInfo.resource,
      target_action: "view",
    }),
    supabase.rpc("has_business_permission", {
      target_business_id: business.id,
      target_resource: moduleInfo.resource,
      target_action: "create",
    }),
    supabase.rpc("has_business_permission", {
      target_business_id: business.id,
      target_resource: moduleInfo.resource,
      target_action: "delete",
    }),
    supabase.rpc("has_business_permission", {
      target_business_id: business.id,
      target_resource: moduleInfo.resource,
      target_action: "edit",
    }),
  ]);
  const permissionError = viewPermission.error ?? createPermission.error ?? deletePermission.error;

  if (permissionError) {
    return (
      <main className="business-content">
        <div className="admin-error-panel" role="alert">
          <strong>Oggolaanshaha module-kan lama xaqiijin.</strong>
          <span>{permissionError.message}</span>
        </div>
      </main>
    );
  }

  if (!viewPermission.data) {
    return (
      <main className="business-content">
        <div className="page-heading"><div><div className="page-eyebrow">BUSINESS WORKSPACE</div><h1>{moduleInfo.title}</h1></div></div>
        <div className="admin-error-panel" role="alert">
          <strong>Ma lihid oggolaanshaha aad ku aragto {moduleInfo.title.toLowerCase()}.</strong>
          <span>La xiriir mulkiilaha ganacsiga si doorkaaga loogu daro rukhsadda saxda ah.</span>
        </div>
      </main>
    );
  }

  if (moduleParam === "reports") {
    const { data: canViewSales, error: salesPermissionError } = await supabase.rpc("has_business_permission", {
      target_business_id: business.id,
      target_resource: "sales",
      target_action: "view",
    });
    if (salesPermissionError) return <ModuleError title={moduleInfo.title} message={salesPermissionError.message} />;
    if (!canViewSales) return <ModuleError title={moduleInfo.title} message="Doorkaagu ma oggola inaad aragto iibka ku jira warbixinta." />;
  }

  if (moduleParam === "settings") {
    const [editPermission, settingsResult] = await Promise.all([
      supabase.rpc("has_business_permission", {
        target_business_id: business.id,
        target_resource: "settings",
        target_action: "edit",
      }),
      supabase.from("business_settings").select("currency,timezone")
        .eq("business_id", business.id).maybeSingle(),
    ]);
    const settingsError = editPermission.error ?? settingsResult.error;
    if (settingsError) {
      return <ModuleError title={moduleInfo.title} message={settingsError.message} />;
    }

    return (
      <main className="business-content">
        <div className="page-heading">
          <div><div className="page-eyebrow">BUSINESS WORKSPACE</div><h1>{moduleInfo.title}</h1><p>{moduleInfo.description}</p></div>
        </div>
        {noticeText((await searchParams).notice) && <p className="workspace-notice" role="status">{noticeText((await searchParams).notice)}</p>}
        {!settingsResult.data ? (
          <ModuleError title={moduleInfo.title} message="Business settings record lama helin. Hubi migration-ka iyo in workspace-ka si sax ah loo ansixiyey." />
        ) : editPermission.data ? (
          <section className="panel workspace-module-panel">
            <form className="workspace-module-form" method="post" action={`/api/workspace/${business.id}/settings`}>
              <label className="workspace-module-field" htmlFor="business-currency"><span>Lacagta (ISO 4217) *</span><input defaultValue={(settingsResult.data as BusinessSettings).currency} id="business-currency" maxLength={3} name="currency" required /></label>
              <label className="workspace-module-field" htmlFor="business-timezone"><span>Timezone (IANA) *</span><input defaultValue={(settingsResult.data as BusinessSettings).timezone} id="business-timezone" maxLength={80} name="timezone" required /></label>
              <button className="button button-dark" type="submit">Settings-ka kaydi</button>
            </form>
          </section>
        ) : (
          <section className="panel workspace-module-panel"><p>Lama oggola beddelka settings-ka. Currency: {(settingsResult.data as BusinessSettings).currency} · Timezone: {(settingsResult.data as BusinessSettings).timezone}</p></section>
        )}
      </main>
    );
  }

  let result;
  let productsForSale: ProductChoice[] = [];
  let customersForSale: CustomerChoice[] = [];
  let choiceError: string | null = null;
  let productSalesById: Record<string, ProductSalesSummary> = {};
  let canViewProductSales = false;
  let productBranches: { id: string; name: string }[] = [];
  let productImagesById: Record<string, ProductImageView[]> = {};
  switch (moduleParam) {
    case "products":
      result = await supabase.from("products")
        .select("id,name,description,barcode,sku,category,branch_id,quantity,cost_price,selling_price,status,created_at")
        .eq("business_id", business.id).order("created_at", { ascending: false }).limit(100);
      {
        const [salesPermission, branchPermission] = await Promise.all([
          supabase.rpc("has_business_permission", {
            target_business_id: business.id,
            target_resource: "sales",
            target_action: "view",
          }),
          supabase.rpc("has_business_permission", {
            target_business_id: business.id,
            target_resource: "branches",
            target_action: "view",
          }),
        ]);
        if (salesPermission.error || branchPermission.error) {
          choiceError = salesPermission.error?.message ?? branchPermission.error?.message ?? null;
        } else {
          canViewProductSales = salesPermission.data === true;
          if (canViewProductSales) {
            const { data: salesSummary, error: salesSummaryError } = await supabase.rpc(
              "get_business_product_sales_summary",
              { target_business_id: business.id },
            );
            if (salesSummaryError) {
              choiceError = salesSummaryError.message;
            } else {
              productSalesById = Object.fromEntries(
                ((salesSummary ?? []) as ProductSalesSummary[]).map((summary) => [summary.product_id, summary]),
              );
            }
          }
          if (branchPermission.data === true) {
            const { data: branches, error: branchesError } = await supabase.from("branches")
              .select("id,name").eq("business_id", business.id).eq("status", "active").order("name").limit(100);
            if (branchesError) choiceError = branchesError.message;
            else productBranches = branches ?? [];
          }
          const { data: imageRows, error: imagesError } = await supabase.from("product_images")
            .select("id,product_id,storage_path,is_primary")
            .eq("business_id", business.id).order("created_at").limit(500);
          if (imagesError) {
            choiceError = imagesError.message;
          } else {
            const signedImages = await Promise.all((imageRows ?? []).map(async (image) => {
              const { data: signed, error: signError } = await supabase.storage
                .from("velto-product-images").createSignedUrl(image.storage_path, 3600);
              if (signError || !signed) {
                return { image, error: signError?.message ?? "Sawirka lama saxiixin." };
              }
              return {
                image,
                error: null,
                signedUrl: signed.signedUrl,
              };
            }));
            const failedImage = signedImages.find((item) => item.error);
            if (failedImage) {
              choiceError = failedImage.error;
            } else {
              productImagesById = signedImages.reduce<Record<string, ProductImageView[]>>((grouped, item) => {
                if (!item.signedUrl) return grouped;
                const productId = item.image.product_id;
                (grouped[productId] ??= []).push({
                  id: item.image.id,
                  storagePath: item.image.storage_path,
                  signedUrl: item.signedUrl,
                  isPrimary: item.image.is_primary,
                });
                return grouped;
              }, {});
            }
          }
        }
      }
      break;
    case "customers":
      result = await supabase.from("customers")
        .select("id,name,email,phone,address,created_at")
        .eq("business_id", business.id).order("created_at", { ascending: false }).limit(100);
      break;
    case "suppliers":
      result = await supabase.from("suppliers")
        .select("id,name,email,phone,address,created_at")
        .eq("business_id", business.id).order("created_at", { ascending: false }).limit(100);
      break;
    case "branches":
      result = await supabase.from("branches")
        .select("id,name,phone,address,status,created_at")
        .eq("business_id", business.id).order("created_at", { ascending: false }).limit(100);
      break;
    case "sales":
      result = await supabase.from("sales")
        .select("id,invoice_number,total,status,sold_at")
        .eq("business_id", business.id).order("sold_at", { ascending: false }).limit(100);
      if (createPermission.data) {
        const [productChoices, customerChoices] = await Promise.all([
          supabase.from("products").select("id,name,sku,quantity,selling_price")
            .eq("business_id", business.id).eq("status", "active").gt("quantity", 0).order("name").limit(100),
          supabase.from("customers").select("id,name")
            .eq("business_id", business.id).order("name").limit(100),
        ]);
        choiceError = productChoices.error?.message ?? customerChoices.error?.message ?? null;
        productsForSale = (productChoices.data ?? []) as ProductChoice[];
        customersForSale = (customerChoices.data ?? []) as CustomerChoice[];
      }
      break;
    case "invoices":
      result = await supabase.from("invoices")
        .select("id,invoice_number,status,subtotal,tax,total,issued_at,due_at")
        .eq("business_id", business.id).order("created_at", { ascending: false }).limit(100);
      break;
    case "reports":
      result = await supabase.from("sales")
        .select("id,invoice_number,total,status,sold_at")
        .eq("business_id", business.id).order("sold_at", { ascending: false }).limit(100);
      break;
  }

  const search = await searchParams;
  const notice = noticeText(search.notice);
  const records = (result.data ?? []) as RecordRow[];
  const reportTotal = moduleParam === "reports"
    ? records.filter((record) => record.status === "completed").reduce((total, record) => total + Number(record.total || 0), 0)
    : 0;

  return (
    <main className="business-content">
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">BUSINESS WORKSPACE · {business.category.toUpperCase()}</div>
          <h1>{moduleInfo.title}</h1>
          <p>{moduleInfo.description}</p>
        </div>
        <Link className="button button-light" href={`/app/workspace/${business.id}`}>Dashboard-ka ku noqo</Link>
      </div>
      {notice && <p className={notice === "Xogta waa la kaydiyey." || notice === "Diiwaanka waa la saaray." ? "workspace-notice" : "form-error"} role="status">{notice}</p>}
      {result.error || choiceError ? (
        <ModuleError title={moduleInfo.title} message={result.error?.message ?? choiceError ?? "Xog lama helin."} />
      ) : (
        <>
          {moduleParam === "reports" && (
            <div className="stat-grid business-stat-grid">
                  <div className="stat-card stat-card-primary"><span className="stat-label">COMPLETED SALES (LATEST 100)</span><strong className="stat-value">{records.filter((record) => record.status === "completed").length}</strong><span className="stat-foot">Diiwaannada iibka ee ugu dambeeyay</span></div>
                  <div className="stat-card"><span className="stat-label">VALUE (LATEST 100)</span><strong className="stat-value">{reportTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong><span className="stat-foot">Currency lama isku beddelin</span></div>
            </div>
          )}
              {createPermission.data && ["products", "customers", "suppliers", "branches"].includes(moduleParam) && (
            <section className="panel workspace-module-panel">
              <div className="section-heading"><div><span className="section-kicker">DIIWAAN CUSUB</span><h2>{moduleInfo.title} ku dar</h2></div></div>
              <form className="workspace-module-form" method="post" action={`/api/workspace/${business.id}/${moduleParam}`}>
                {moduleInfo.fields.map((field) => (
                  <label className="workspace-module-field" htmlFor={`${moduleParam}-${field.name}`} key={field.name}>
                    <span>{field.label}{field.required && <i> *</i>}</span>
                    {field.type === "textarea" ? (
                      <textarea id={`${moduleParam}-${field.name}`} name={field.name} maxLength={2000} rows={3} />
                    ) : (
                      <input
                        id={`${moduleParam}-${field.name}`}
                        name={field.name}
                        required={field.required}
                        type={field.type}
                        step={field.step}
                        min={field.min}
                        maxLength={field.type === "text" ? (field.name === "barcode" ? 120 : 160) : undefined}
                      />
                    )}
                  </label>
                ))}
                {moduleParam === "products" && productBranches.length > 0 && (
                  <label className="workspace-module-field" htmlFor="products-branch">
                    <span>Laanta</span>
                    <select className="workspace-select" defaultValue="" id="products-branch" name="branch_id">
                      <option value="">Laamaha oo dhan</option>
                      {productBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                )}
                <button className="button button-dark" type="submit">Kaydi</button>
              </form>
            </section>
          )}
          {moduleParam === "sales" && createPermission.data && (
            <section className="panel workspace-module-panel">
              <div className="section-heading"><div><span className="section-kicker">IIB CUSUB</span><h2>Alaab iib gee</h2></div></div>
              {productsForSale.length > 0 ? (
                <SaleForm
                  action={`/api/workspace/${business.id}/${moduleParam}`}
                  customers={customersForSale}
                  products={productsForSale}
                />
              ) : (
                <p className="form-hint">Alaab kayd leh oo firfircoon ma jirto. Marka hore ku dar alaab oo kayd geli.</p>
              )}
            </section>
          )}
          <section className="panel workspace-module-panel">
            <div className="section-heading">
              <div><span className="section-kicker">XOGTA GANACSIGAAGA</span><h2>{records.length} diiwaan</h2></div>
            </div>
            {records.length === 0 ? (
              <div className="admin-empty"><strong>Weli wax xog ah laguma darin.</strong><span>Marka xog la geliyo, halkan ayay ka muuqanaysaa.</span></div>
            ) : (
              <div className="workspace-table-wrap">
                <table className="workspace-table">
                  <thead><tr>{moduleInfo.columns.map((column) => <th key={column.name}>{column.label}</th>)}{moduleParam === "products" && <><th>Xaaladda kaydka</th><th>Sawirrada</th>{canViewProductSales && <><th>Units sold</th><th>Revenue</th><th>Iibkii ugu dambeeyay</th><th>Xaaladda iibka</th></>}</>}{(deletePermission.data || (moduleParam === "products" && editPermission.data)) && <th>Ficil</th>}</tr></thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={display(record.id)}>
                        {moduleInfo.columns.map((column) => (
                          <td key={column.name}>{display(record[column.name])}</td>
                        ))}
                        {moduleParam === "products" && (
                          <>
                            <td>{Number(record.quantity) > 0 ? "Available in stock" : "Out of stock"}</td>
                            <td><ProductImageManager
                              businessId={business.id}
                              canManage={createPermission.data === true || editPermission.data === true}
                              initialImages={productImagesById[display(record.id)] ?? []}
                              productId={display(record.id)}
                            /></td>
                            {canViewProductSales && (
                              <>
                                <td>{Number(productSalesById[display(record.id)]?.units_sold ?? 0).toLocaleString("en-US")}</td>
                                <td>{Number(productSalesById[display(record.id)]?.revenue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td>{formatProductDate(productSalesById[display(record.id)]?.last_sold_at)}</td>
                                <td>{productSalesStatus(productSalesById[display(record.id)], record.quantity)}</td>
                              </>
                            )}
                          </>
                        )}
                        {(deletePermission.data || (moduleParam === "products" && editPermission.data)) && ["products", "customers", "suppliers", "branches"].includes(moduleParam) && (
                          <td>
                            {moduleParam === "products" && editPermission.data && (
                              <ProductEditForm
                                action={`/api/workspace/${business.id}/${moduleParam}`}
                                branches={productBranches}
                                canEditBranch={productBranches.length > 0}
                                product={record}
                              />
                            )}
                            {deletePermission.data && (
                            <form method="post" action={`/api/workspace/${business.id}/${moduleParam}`}>
                              <input type="hidden" name="_action" value="delete" />
                              <input type="hidden" name="id" value={display(record.id)} />
                              <button className="action-button action-danger" type="submit">Ka saar</button>
                            </form>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {records.length === 100 && <p className="workspace-list-limit">Waxa la muujinayaa 100-ka diiwaan ee ugu dambeeyay.</p>}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function ModuleError({ title, message }: { title: string; message: string }) {
  return (
    <main className="business-content">
      <div className="admin-error-panel" role="alert">
        <strong>Xogta {title.toLowerCase()} lama heli karin.</strong>
        <span>{message}</span>
      </div>
    </main>
  );
}

function ProductEditForm({
  action,
  branches,
  canEditBranch,
  product,
}: {
  action: string;
  branches: { id: string; name: string }[];
  canEditBranch: boolean;
  product: RecordRow;
}) {
  const currentBranchId = typeof product.branch_id === "string" ? product.branch_id : "";
  return (
    <details>
      <summary className="action-button">Wax ka beddel</summary>
      <form className="workspace-module-form" action={action} method="post">
        <input name="_action" type="hidden" value="update" />
        <input name="id" type="hidden" value={display(product.id)} />
        <label className="workspace-module-field">
          <span>Magaca alaabta *</span>
          <input defaultValue={display(product.name) === "—" ? "" : display(product.name)} maxLength={160} name="name" required />
        </label>
        <label className="workspace-module-field">
          <span>Sharaxaadda</span>
          <textarea defaultValue={typeof product.description === "string" ? product.description : ""} maxLength={2000} name="description" rows={3} />
        </label>
        <label className="workspace-module-field">
          <span>Barcode</span>
          <input defaultValue={typeof product.barcode === "string" ? product.barcode : ""} maxLength={120} name="barcode" />
        </label>
        <label className="workspace-module-field">
          <span>SKU</span>
          <input defaultValue={typeof product.sku === "string" ? product.sku : ""} maxLength={80} name="sku" />
        </label>
        <label className="workspace-module-field">
          <span>Qaybta</span>
          <input defaultValue={typeof product.category === "string" ? product.category : ""} maxLength={120} name="category" />
        </label>
        <label className="workspace-module-field">
          <span>Xaaladda</span>
          <select className="workspace-select" defaultValue={product.status === "archived" ? "archived" : "active"} name="status">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        {canEditBranch && (
          <label className="workspace-module-field">
            <span>Laanta</span>
            <select className="workspace-select" defaultValue={currentBranchId} name="branch_id">
              <option value="">Laamaha oo dhan</option>
              {currentBranchId && !branches.some((branch) => branch.id === currentBranchId) && (
                <option value={currentBranchId}>Laanta hadda jirta</option>
              )}
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        )}
        <div className="form-row">
          <label className="workspace-module-field">
            <span>Tirada kaydka *</span>
            <input defaultValue={String(product.quantity ?? 0)} min="0" name="quantity" required step="0.001" type="number" />
          </label>
          <label className="workspace-module-field">
            <span>Qiimaha lagu soo iibsaday *</span>
            <input defaultValue={String(product.cost_price ?? 0)} min="0" name="cost_price" required step="0.01" type="number" />
          </label>
          <label className="workspace-module-field">
            <span>Qiimaha iibka *</span>
            <input defaultValue={String(product.selling_price ?? 0)} min="0" name="selling_price" required step="0.01" type="number" />
          </label>
        </div>
        <button className="button button-dark" type="submit">Cusboonaysii alaabta</button>
      </form>
    </details>
  );
}

function ModuleLoading() {
  return (
    <main className="business-content" aria-busy="true">
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">BUSINESS WORKSPACE</div>
          <h1>Qaybta waa la furayaa.</h1>
        </div>
      </div>
    </main>
  );
}

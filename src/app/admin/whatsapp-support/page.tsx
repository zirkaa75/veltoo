import { Suspense } from "react";
import { connection } from "next/server";
import { requireSupportAgent } from "@/lib/auth/authorization";
import WhatsAppSupportCenter from "./whatsapp-support-center";

export const instant = true;

export default function WhatsAppSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<SupportCenterLoading />}>
      <WhatsAppSupportContent searchParams={searchParams} />
    </Suspense>
  );
}

async function WhatsAppSupportContent({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await connection();
  const { role } = await requireSupportAgent();
  const params = await searchParams;
  const initialView = role === "platform_administrator" && params.tab === "settings" ? "settings" : "inbox";
  return <WhatsAppSupportCenter role={role} initialView={initialView} />;
}

function SupportCenterLoading() {
  return (
    <main className="support-admin-shell">
      <div className="support-admin-heading"><div><div className="page-eyebrow">CUSTOMER CARE</div><h1>WhatsApp Support Center</h1><p>Inbox-ka waa la furayaa…</p></div></div>
    </main>
  );
}

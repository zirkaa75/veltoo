import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireBusinessMember } from "@/lib/auth/authorization";

export const instant = true;

export default function BusinessDashboardAlias() {
  return (
    <Suspense fallback={<main className="portal-invitation-loading" aria-live="polite">VELTO</main>}>
      <BusinessDashboardContent />
    </Suspense>
  );
}

async function BusinessDashboardContent() {
  await connection();
  const { membership } = await requireBusinessMember();
  redirect(`/app/workspace/${membership.business_id}`);
  return null;
}

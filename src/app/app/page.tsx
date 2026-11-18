import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireBusinessMember } from "@/lib/auth/authorization";

export const instant = true;

export default function BusinessPortalEntry() {
  return (
    <Suspense fallback={<BusinessEntryLoading />}>
      <BusinessPortalContent />
    </Suspense>
  );
}

async function BusinessPortalContent() {
  await connection();
  const { membership } = await requireBusinessMember();
  redirect(`/app/workspace/${membership.business_id}`);
  return null;
}

function BusinessEntryLoading() {
  return (
    <main className="auth-page" aria-live="polite">
      <section className="auth-card">
        <div className="auth-kicker">BUSINESS WORKSPACE</div>
        <h1>Workspace-ka waa la furayaa.</h1>
      </section>
    </main>
  );
}

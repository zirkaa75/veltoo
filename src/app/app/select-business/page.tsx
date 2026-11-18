import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireBusinessAccount } from "@/lib/auth/authorization";

type MembershipBusiness = {
  business_id: string;
  role: string;
  businesses: { id: string; name: string; category: string; status: string }[];
};

export const instant = true;

export default function SelectBusinessPage() {
  return (
    <Suspense fallback={<SelectBusinessLoading />}>
      <SelectBusinessContent />
    </Suspense>
  );
}

async function SelectBusinessContent() {
  await connection();
  const { supabase, user } = await requireBusinessAccount();

  const { data: memberships, error } = await supabase
    .from("business_users")
    .select("business_id, role, businesses!inner(id, name, category, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("businesses.status", "active");

  if (error || !memberships?.length) redirect("/app/login?error=no-workspace");
  if (memberships.length === 1 && memberships[0]) redirect(`/app/workspace/${memberships[0].business_id}`);

  return (
    <main className="auth-page">
      <Link className="brand auth-brand" href="/"><span className="brand-mark">V</span><span>VELTO</span></Link>
      <section className="auth-card workspace-picker">
        <div className="auth-kicker">BUSINESS WORKSPACES</div>
        <h1>Ganacsiga dooro.</h1>
        <p className="auth-description">Waxaad arki kartaa workspaces-ka aad xubin firfircoon ka tahay oo keliya.</p>
        <div className="workspace-options">
          {(memberships as MembershipBusiness[]).map((membership) => {
            const business = membership.businesses[0];
            if (!business) return null;
            return (
            <Link className="workspace-option" href={`/app/workspace/${membership.business_id}`} key={membership.business_id} prefetch={true}>
              <span className="workspace-option-icon">⌂</span>
              <span><strong>{business.name}</strong><small>{business.category} · {membership.role}</small></span>
              <b aria-hidden="true">→</b>
            </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function SelectBusinessLoading() {
  return (
    <main className="auth-page" aria-live="polite">
      <section className="auth-card">
        <div className="auth-kicker">BUSINESS WORKSPACES</div>
        <h1>Workspaces-ka waa la rarayaa.</h1>
      </section>
    </main>
  );
}

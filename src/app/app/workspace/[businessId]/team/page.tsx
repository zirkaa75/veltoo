import { connection } from "next/server";
import { Suspense } from "react";
import { requireBusinessMember } from "@/lib/auth/authorization";
import { loadBusinessWorkspaceConfig, workspaceAllowsModule } from "@/lib/workspace/config";
import TeamManager, { type TeamMember } from "./team-manager";

export default function BusinessTeamPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<TeamLoading />}>
      <BusinessTeamContent params={params} />
    </Suspense>
  );
}

async function BusinessTeamContent({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  await connection();
  const { businessId } = await params;
  const { business, user, supabase } = await requireBusinessMember(businessId);
  const { config: workspaceConfig, error: workspaceConfigError } = await loadBusinessWorkspaceConfig(supabase, business.id);
  if (workspaceConfigError) return <TeamError message={workspaceConfigError.message} />;
  if (!workspaceAllowsModule(workspaceConfig, "team")) {
    return <TeamError message="Qaybtan laguma darin subscription plan-ka ganacsiga." />;
  }
  const [viewPermission, createPermission, removePermission] = await Promise.all([
    supabase.rpc("has_business_permission", {
      target_business_id: business.id,
      target_resource: "team",
      target_action: "view",
    }),
    supabase.rpc("has_business_permission", {
      target_business_id: business.id,
      target_resource: "team",
      target_action: "create",
    }),
    supabase.rpc("has_business_permission", {
      target_business_id: business.id,
      target_resource: "team",
      target_action: "delete",
    }),
  ]);
  const permissionError = viewPermission.error ?? createPermission.error ?? removePermission.error;

  if (permissionError) {
    return <TeamError message={permissionError.message} />;
  }
  if (!viewPermission.data) {
    return <TeamError message="Doorkaagu ma oggola inaad aragto liiska xubnaha." />;
  }

  const { data: members, error } = await supabase.from("business_users")
    .select("user_id,display_name,email,role,status,created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true });

  if (error) {
    const missingContactColumn =
      error.code === "42703"
      && error.message.includes("business_users")
      && (error.message.includes("display_name") || error.message.includes("email"));
    return (
      <TeamError
        message={missingContactColumn
          ? "Database-ka business_users waxaa ka maqan display_name ama email. Ku socodsii supabase/fix-business-users-contact-fields.sql gudaha Supabase SQL Editor, kadib dib u fur boggan."
          : error.message}
      />
    );
  }

  return (
    <TeamManager
      businessId={business.id}
      canInvite={Boolean(createPermission.data)}
      canRemove={Boolean(removePermission.data)}
      currentUserId={user.id}
      initialMembers={(members ?? []) as TeamMember[]}
      businessName={business.name}
    />
  );
}

function TeamLoading() {
  return (
    <main className="business-content" aria-live="polite">
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">BUSINESS WORKSPACE · TEAM</div>
          <h1>Kooxda waa la furayaa.</h1>
          <p>Sug inta rukhsadaha iyo xubnaha la xaqiijinayo.</p>
        </div>
      </div>
    </main>
  );
}

function TeamError({ message }: { message: string }) {
  return (
    <main className="business-content">
      <div className="admin-error-panel" role="alert">
        <strong>Team-ka lama furi karin.</strong>
        <span>{message}</span>
      </div>
    </main>
  );
}

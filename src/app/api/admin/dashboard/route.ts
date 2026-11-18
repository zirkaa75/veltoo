import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSuperAdminSnapshot } from "@/app/admin/dashboard/load-snapshot";

export async function GET() {
  const supabase = await createClient("admin");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("platform_admins")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("Could not verify dashboard administrator access:", membershipError.message);
    return NextResponse.json({ error: "Could not verify administrator access." }, { status: 500 });
  }
  if (!membership || membership.status !== "active" || membership.role !== "platform_administrator") {
    return NextResponse.json({ error: "Platform administrator access only." }, { status: 403 });
  }

  const { data, error } = await loadSuperAdminSnapshot();
  if (error || !data) {
    console.error("Could not load Super Admin dashboard data:", error);
    return NextResponse.json(
      { error: "Xogta platform-ka lama soo rari karin. Hubi isku xirka database-ka iyo rukhsadaha." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
